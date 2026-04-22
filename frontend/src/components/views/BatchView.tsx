import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileStack,
  Settings,
  ChevronRight,
  Info,
  Layers,
  ArrowRight,
  X,
  CreditCard,
  History
} from 'lucide-react';
import { compressImage } from '../../lib/storage';
import { useCards, useCreateCard, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
import type { AIIdentificationResult, CardType } from '../../types';

interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  pct: number;
}

async function fetchQuota(token: string): Promise<QuotaInfo | null> {
  try {
    const r = await fetch(`${API_BASE}/api/identify/quota`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function QuotaBar({ quota }: { quota: QuotaInfo }) {
  const danger = quota.remaining < 50;
  const warn = quota.remaining < 150;
  const color = danger ? '#ef4444' : warn ? 'var(--accent)' : '#10b981';

  return (
    <div className="panel p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-white/30">
          <History size={12} />
          <span>Quota Identité IA</span>
        </div>
        <span className="text-[10px] font-black" style={{ color }}>{quota.remaining} / {quota.limit} RESTANTS</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-white/5 p-[1px]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${quota.pct}%` }}
          className="h-full rounded-full transition-all"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[_\-\s]+/g, ' ').trim();
}

type PairMethod = 'sequential' | 'suffix';

const FRONT_SUFFIXES = ['recto', 'front', 'face', 'r'];
const BACK_SUFFIXES = ['verso', 'back', 'dos', 'v'];

function pairBySuffix(files: File[]): { pairs: Pair[]; unpaired: string } {
  function getSuffix(name: string): { base: string; side: 'front' | 'back' | null } {
    const noExt = name.replace(/\.[^.]+$/, '');
    const match = noExt.match(/^(.*?)[\s_-]+([a-zA-Z]+)$/);
    if (!match) return { base: noExt, side: null };
    const suffix = match[2].toLowerCase();
    if (FRONT_SUFFIXES.includes(suffix)) return { base: match[1].trim(), side: 'front' };
    if (BACK_SUFFIXES.includes(suffix)) return { base: match[1].trim(), side: 'back' };
    return { base: noExt, side: null };
  }

  const fronts = new Map<string, File>();
  const backs = new Map<string, File>();
  const unmatched: string[] = [];

  files.forEach((f) => {
    const { base, side } = getSuffix(f.name);
    if (side === 'front') fronts.set(base, f);
    else if (side === 'back') backs.set(base, f);
    else unmatched.push(f.name);
  });

  const pairs: Pair[] = [];
  fronts.forEach((front, base) => {
    const back = backs.get(base);
    if (back) { pairs.push({ front, back }); backs.delete(base); }
    else unmatched.push(front.name);
  });
  backs.forEach((f) => unmatched.push(f.name));

  return { pairs, unpaired: unmatched.join(', ') };
}

const PAIR_DELAY_MS = 6500;

interface Pair {
  front: File;
  back: File;
}

type PairStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface PairResult {
  pair: Pair;
  status: PairStatus;
  step?: string;
  error?: string;
}

function statusMeta(status: PairStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'running':
      return { label: 'ANALYSE…', color: 'var(--accent)', bg: 'var(--accent-dim)' };
    case 'done':
      return { label: 'SUCCÈS', color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
    case 'error':
      return { label: 'ERREUR', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    case 'skipped':
      return { label: 'DOUBLON', color: 'var(--text-muted)', bg: 'white/5' };
    default:
      return { label: 'ATTENTE', color: 'var(--text-muted)', bg: 'white/5' };
  }
}

async function fileToBase64(file: File): Promise<string> {
  const blob = await compressImage(file);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (match) resolve(match[1]);
      else reject(new Error('Invalid data URL'));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function BatchView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<PairMethod>('sequential');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [unpaired, setUnpaired] = useState<string>('');
  const [results, setResults] = useState<PairResult[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState('');
  const [draftCount, setDraftCount] = useState(0);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [retryingIndexes, setRetryingIndexes] = useState<number[]>([]);
  const [retryingAll, setRetryingAll] = useState(false);
  const { data: existingCards = [] } = useCards();
  const createCard = useCreateCard();
  const deleteCard = useDeleteCard();
  const updateCard = useUpdateCard();
  const setActiveView = useAppStore((s) => s.setActiveView);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) fetchQuota(token).then(setQuota);
    });
  }, []);

  const allFiles = useRef<File[]>([]);
  function reparseFiles(files: File[], m: PairMethod) {
    let newPairs: Pair[] = [];
    let unpairedStr = '';
    if (m === 'sequential') {
      for (let i = 0; i + 1 < files.length; i += 2) newPairs.push({ front: files[i], back: files[i + 1] });
      unpairedStr = files.length % 2 === 1 ? files[files.length - 1].name : '';
    } else {
      const result = pairBySuffix(files);
      newPairs = result.pairs;
      unpairedStr = result.unpaired;
    }
    setPairs(newPairs);
    setUnpaired(unpairedStr);
    setResults(newPairs.map((pair) => ({ pair, status: 'pending' })));
    setSummary('');
    setDraftCount(0);
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
    allFiles.current = files;
    reparseFiles(files, method);
  }

  const [draggingOver, setDraggingOver] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDraggingOver(false);
    if (running) return;
    const files = Array.from(e.dataTransfer.files)
      .filter((f) => f.type.startsWith('image/'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (files.length === 0) return;
    allFiles.current = files;
    reparseFiles(files, method);
  }

  function updateResult(index: number, update: Partial<PairResult>) {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, ...update } : r)));
  }

  function buildSummaryFromResults(nextResults: PairResult[]) {
    const success = nextResults.filter((r) => r.status === 'done').length;
    const skipped = nextResults.filter((r) => r.status === 'skipped').length;
    const errors = nextResults.filter((r) => r.status === 'error').length;

    return (
      `${success} carte(s) traitées` +
      (skipped > 0 ? ` · ${skipped} doublons` : '') +
      (errors > 0 ? ` · ${errors} erreurs` : '')
    );
  }

  function currentKnownNames() {
    const knownNames = new Set<string>();
    existingCards.forEach((c) => {
      if (c.image_front_url) knownNames.add(normalizeName(c.image_front_url.split('/').pop() ?? ''));
      if (c.image_back_url) knownNames.add(normalizeName(c.image_back_url.split('/').pop() ?? ''));
    });
    return knownNames;
  }

  async function processPair(index: number, token: string, onStep?: (step: string) => void) {
    const pair = pairs[index];
    if (!pair) return { status: 'error' as const, error: 'Paire introuvable.' };

    const knownNames = currentKnownNames();
    const frontNorm = normalizeName(pair.front.name);
    const backNorm = normalizeName(pair.back.name);
    if (knownNames.has(frontNorm) || knownNames.has(backNorm)) {
      return { status: 'skipped' as const, error: 'Doublon détecté — déjà dans la collection' };
    }

    let createdCardId: string | null = null;
    let failedStep = 'identification';

    try {
      onStep?.('Optimisation');
      const [front_base64, back_base64] = await Promise.all([
        fileToBase64(pair.front),
        fileToBase64(pair.back),
      ]);

      onStep?.('Analyse IA');
      const identResp = await fetch(`${API_BASE}/api/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ front_base64, back_base64 }),
      });
      if (!identResp.ok) throw new Error(`Identify: ${await identResp.text()}`);
      const ai: AIIdentificationResult = await identResp.json();

      failedStep = 'création du brouillon';
      onStep?.('Extraction');
      const newCard = await createCard.mutateAsync({
        player: ai.player || null,
        team: ai.team || null,
        year: ai.year || null,
        brand: ai.brand || null,
        set_name: ai.set || null,
        insert_name: ai.insert || null,
        parallel_name: ai.parallel || null,
        parallel_confidence: ai.parallel_confidence ?? null,
        card_number: ai.card_number || null,
        numbered: ai.numbered || null,
        is_rookie: !!ai.is_rookie,
        condition_notes: ai.condition_notes || null,
        card_type: (ai.card_type || null) as CardType | null,
        status: 'draft',
      });
      createdCardId = newCard.id;

      async function upload(file: File, side: 'front' | 'back'): Promise<string> {
        const blob = await compressImage(file);
        const form = new FormData();
        form.append('file', new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
        form.append('card_id', newCard.id);
        form.append('side', side);
        const r = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()).url;
      }

      failedStep = 'upload des images';
      onStep?.('Stockage Cloud');
      const [image_front_url, image_back_url] = await Promise.all([
        upload(pair.front, 'front'),
        upload(pair.back, 'back'),
      ]);

      failedStep = 'enregistrement final';
      onStep?.('Finalisation');
      await updateCard.mutateAsync({
        id: newCard.id,
        image_front_url,
        image_back_url,
      });

      fetchQuota(token).then((q) => q && setQuota(q));
      return { status: 'done' as const, step: undefined };
    } catch (e) {
      const message = (e as Error).message;
      let error = `${message}`;

      if (createdCardId) {
        try {
          await deleteCard.mutateAsync(createdCardId);
        } catch { }
      }

      return { status: 'error' as const, error, step: undefined };
    }
  }

  async function runBatch() {
    if (running || pairs.length === 0) return;
    setRunning(true);
    setSummary('');
    setDraftCount(0);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const userId = data.session?.user?.id;
    if (!token || !userId) {
      setSummary('Non authentifié.');
      setRunning(false);
      return;
    }

    const currentResults = [...results];

    for (let i = 0; i < pairs.length; i++) {
      // Filter out already done ones or those we might want to skip? 
      // For a standard run we assume we process all.
      updateResult(i, { status: 'running', step: 'Booting…', error: undefined });
      const result = await processPair(i, token, (step) => updateResult(i, { status: 'running', step, error: undefined }));
      updateResult(i, result);

      if (result.status === 'done') setDraftCount((n) => n + 1);

      if (i + 1 < pairs.length) await sleep(PAIR_DELAY_MS);
    }

    setRunning(false);
    setSummary('Importation terminée');
  }

  async function retryPair(index: number) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    setRetryingIndexes((prev) => [...prev, index]);
    updateResult(index, { status: 'running', step: 'Retry…', error: undefined });

    const result = await processPair(index, token, (step) => updateResult(index, { status: 'running', step, error: undefined }));
    updateResult(index, result);
    if (result.status === 'done') setDraftCount((n) => n + 1);
    setRetryingIndexes((prev) => prev.filter((i) => i !== index));
  }

  async function retryFailedPairs() {
    const failedIndexes = results.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'error').map(({ i }) => i);
    if (failedIndexes.length === 0) return;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    setRetryingAll(true);
    setRetryingIndexes(failedIndexes);

    for (let pos = 0; pos < failedIndexes.length; pos++) {
      const index = failedIndexes[pos];
      updateResult(index, { status: 'running', step: 'Retry…', error: undefined });
      const result = await processPair(index, token, (step) => updateResult(index, { status: 'running', step, error: undefined }));
      updateResult(index, result);
      if (result.status === 'done') setDraftCount((n) => n + 1);
      setRetryingIndexes((prev) => prev.filter((i) => i !== index));
      if (pos + 1 < failedIndexes.length) await sleep(PAIR_DELAY_MS);
    }
    setRetryingAll(false);
  }

  const doneCount = results.filter((r) => r.status === 'done').length;
  const totalCount = pairs.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isFinished = !running && results.some(r => r.status === 'done');
  const errorCount = results.filter((r) => r.status === 'error').length;

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveView('collection')}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-white transition-all active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight text-glow">Import Studio</h2>
              <p className="text-sm text-[var(--text-muted)] font-medium">Capturez et identifiez vos lots de cartes</p>
            </div>
          </div>
          {quota && <QuotaBar quota={quota} />}
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-8">
          {/* Dropzone & List */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`panel border-2 border-dashed rounded-[40px] p-12 transition-all group relative overflow-hidden ${draggingOver ? 'bg-[var(--accent-dim)] border-[var(--accent)]/50' : 'bg-white/[0.01] border-white/10 hover:border-white/20'
                } ${pairs.length > 0 && !draggingOver ? 'py-8' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (!running) setDraggingOver(true); }}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={handleDrop}
              onClick={() => !running && fileRef.current?.click()}
            >
              <div className="flex flex-col items-center justify-center text-center gap-4 relative z-10">
                <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center transition-all ${draggingOver ? 'bg-[var(--accent)] text-[#09090B]' : 'bg-white/5 text-white/20 group-hover:text-white/40 group-hover:bg-white/10'
                  }`}>
                  {running ? <RefreshCw size={32} className="animate-spin" /> : <Upload size={32} />}
                </div>
                <div>
                  <p className="text-lg font-black text-white tracking-tight">
                    {draggingOver ? 'C\'est le moment !' : pairs.length > 0 ? `${pairs.length} Paires Chargées` : 'Glissez vos images'}
                  </p>
                  <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mt-1">
                    JPG, PNG, HEIC · Recto & Verso
                  </p>
                </div>
                {!pairs.length && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mt-2">
                    <Info size={12} />
                    Automatisme intelligent
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
            </motion.div>

            {pairs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-2 mb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Fichiers à traiter ({pairs.length})</h3>
                  {!running && errorCount > 0 && (
                    <button onClick={retryFailedPairs} className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors">
                      Relancer les erreurs ({errorCount})
                    </button>
                  )}
                </div>

                <div className="space-y-px rounded-[32px] overflow-hidden border border-white/5 bg-white/[0.02]">
                  <AnimatePresence mode="popLayout">
                    {results.map((r, i) => (
                      <motion.div
                        layout
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`flex items-center gap-4 px-6 py-4 transition-colors ${i % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'
                          } ${r.status === 'error' ? 'bg-red-500/5' : ''}`}
                      >
                        <div className="w-6 text-[10px] font-black text-white/20 shrink-0">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-xs font-bold text-white truncate max-w-[200px]">{r.pair.front.name}</p>
                            <ChevronRight size={10} className="text-white/20" />
                            <p className="text-xs font-bold text-white truncate max-w-[200px]">{r.pair.back.name}</p>
                          </div>
                          {r.status === 'running' && r.step && (
                            <p className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">{r.step}...</p>
                          )}
                          {r.error && (
                            <p className="text-[10px] font-bold text-red-500 truncate" title={r.error}>{r.error}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {r.status === 'error' && !running && (
                            <button onClick={() => retryPair(i)} className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white transition-all">
                              <RefreshCw size={12} />
                            </button>
                          )}
                          <div className={`px-2 py-1 rounded-md text-[9px] font-black tracking-widest ${r.status === 'done' ? 'bg-green-500/20 text-green-400' :
                              r.status === 'error' ? 'bg-red-500/20 text-red-400' :
                                r.status === 'running' ? 'bg-[var(--accent-dim)] text-[var(--accent)] animate-pulse' :
                                  'bg-white/5 text-white/20'
                            }`}>
                            {statusMeta(r.status).label}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>

          {/* Settings & Controls */}
          <div className="space-y-6">
            <div className="panel p-6 rounded-[32px] bg-white/[0.03] border border-white/10 space-y-6">
              <div>
                <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">
                  <Settings size={12} />
                  Paramètres d'appairage
                </h3>
                <div className="space-y-2">
                  {[
                    { id: 'sequential', label: 'Consécutif', desc: '1-2, 3-4, 5-6...', icon: FileStack },
                    { id: 'suffix', label: 'Suffixe', desc: '_recto / _verso', icon: Layers }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { setMethod(opt.id as PairMethod); if (allFiles.current.length) reparseFiles(allFiles.current, opt.id as PairMethod); }}
                      className={`w-full text-left p-3 rounded-2xl border transition-all ${method === opt.id ? 'bg-[var(--accent-dim)] border-[var(--accent)]/30' : 'bg-white/5 border-white/5 hover:border-white/10'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <opt.icon size={16} className={method === opt.id ? 'text-[var(--accent)]' : 'text-white/20'} />
                        <div>
                          <p className={`text-xs font-black uppercase tracking-widest ${method === opt.id ? 'text-[var(--accent)]' : 'text-white'}`}>{opt.label}</p>
                          <p className="text-[10px] font-medium text-white/30">{opt.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {pairs.length > 0 && (
                <div className="pt-6 border-t border-white/5 space-y-4">
                  {running && (
                    <div className="space-y-2 px-1">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Progression</span>
                        <span>{doneCount} / {totalCount}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          className="h-full bg-[var(--accent)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {!running && !isFinished && (
                    <button
                      onClick={runBatch}
                      className="w-full py-4 rounded-2xl bg-[var(--accent)] border border-[var(--border-accent)] text-[#09090B] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                      Lancer l'Analyse <ArrowRight size={16} />
                    </button>
                  )}

                  {isFinished && (
                    <button
                      onClick={() => setActiveView('review')}
                      className="w-full py-4 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl hover:bg-white/90 active:scale-[0.98] transition-all"
                    >
                      Vérifier les Brouillons <ArrowRight size={16} />
                    </button>
                  )}

                  {unpaired && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold leading-relaxed">
                      <AlertCircle size={12} className="inline mr-2 mb-0.5" />
                      Certains fichiers sont orphelins : {unpaired}
                    </div>
                  )}
                </div>
              )}
            </div>

            {isFinished && (
              <div className="panel p-6 rounded-[32px] bg-[var(--accent-dim)] border border-[var(--border-accent)]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-[#09090B]">
                    <CheckCircle2 size={16} />
                  </div>
                  <h4 className="text-sm font-black text-white uppercase tracking-tight">Analyse Terminée</h4>
                </div>
                <p className="text-xs font-bold text-[var(--accent)]/70 leading-relaxed uppercase tracking-wide">
                  {doneCount} cartes ont été injectées en mode brouillon pour vérification.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
