import { useRef, useState, useEffect } from 'react';
import { compressImage } from '../../lib/storage';
import { useCards, useCreateCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import type { AIIdentificationResult, CardType } from '../../types';

interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  pct: number;
}

async function fetchQuota(token: string): Promise<QuotaInfo | null> {
  try {
    const r = await fetch('/api/identify/quota', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function QuotaBar({ quota }: { quota: QuotaInfo }) {
  const danger = quota.remaining < 50;
  const warn = quota.remaining < 150;
  const color = danger ? 'var(--red)' : warn ? 'var(--accent)' : 'var(--green)';
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-4 text-sm"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>Quota IA aujourd'hui</span>
          <span style={{ color }}>{quota.remaining} restants / {quota.limit}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${quota.pct}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[_\-\s]+/g, ' ').trim();
}

type PairMethod = 'sequential' | 'suffix';

// Suffixes reconnus pour recto/verso
const FRONT_SUFFIXES = ['recto', 'front', 'face', 'r'];
const BACK_SUFFIXES = ['verso', 'back', 'dos', 'v'];

function pairBySuffix(files: File[]): { pairs: Pair[]; unpaired: string } {
  // Extrait le suffixe après le dernier " - " ou "_" avant l'extension
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

const PAIR_DELAY_MS = 6500; // ~9 req/min to stay under Gemini free tier 10 RPM limit

interface Pair {
  front: File;
  back: File;
}

type PairStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface PairResult {
  pair: Pair;
  status: PairStatus;
  error?: string;
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
  const { data: existingCards = [] } = useCards();
  const createCard = useCreateCard();
  const setActiveView = useAppStore((s) => s.setActiveView);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) fetchQuota(token).then(setQuota);
    });
  }, []);

  // Re-parse si on change de méthode après avoir sélectionné des fichiers
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

  function updateResult(index: number, update: Partial<PairResult>) {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, ...update } : r)));
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

    // Construire un set des noms de photos déjà en base
    const knownNames = new Set<string>();
    existingCards.forEach((c) => {
      if (c.image_front_url) knownNames.add(normalizeName(c.image_front_url.split('/').pop() ?? ''));
      if (c.image_back_url) knownNames.add(normalizeName(c.image_back_url.split('/').pop() ?? ''));
    });

    let success = 0;
    let errors = 0;
    let skipped = 0;

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      updateResult(i, { status: 'running' });

      // Détection doublon par nom de fichier
      const frontNorm = normalizeName(pair.front.name);
      const backNorm = normalizeName(pair.back.name);
      if (knownNames.has(frontNorm) || knownNames.has(backNorm)) {
        updateResult(i, { status: 'skipped', error: 'Doublon détecté — déjà dans la collection' });
        skipped++;
        continue;
      }

      try {
        // 1. Identify
        const [front_base64, back_base64] = await Promise.all([
          fileToBase64(pair.front),
          fileToBase64(pair.back),
        ]);

        const identResp = await fetch('/api/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ front_base64, back_base64 }),
        });
        if (!identResp.ok) throw new Error(`Identify: ${await identResp.text()}`);
        const ai: AIIdentificationResult = await identResp.json();

        // 2. Save as draft
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
          condition_notes: ai.condition_notes || null,
          card_type: null as CardType | null,
          status: 'draft',
        });

        // 3. Upload images
        async function upload(file: File, side: 'front' | 'back'): Promise<string> {
          const blob = await compressImage(file);
          const form = new FormData();
          form.append('file', new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
          form.append('card_id', newCard.id);
          form.append('side', side);
          const r = await fetch('/api/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          if (!r.ok) throw new Error(await r.text());
          return (await r.json()).url;
        }

        const [image_front_url, image_back_url] = await Promise.all([
          upload(pair.front, 'front'),
          upload(pair.back, 'back'),
        ]);

        // 4. Update card with image URLs
        await fetch(`/api/cards/${newCard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ image_front_url, image_back_url }),
        });

        updateResult(i, { status: 'done' });
        success++;
        setDraftCount((n) => n + 1);
        fetchQuota(token).then((q) => q && setQuota(q));
      } catch (e) {
        updateResult(i, { status: 'error', error: (e as Error).message });
        errors++;
      }

      if (i + 1 < pairs.length) await sleep(PAIR_DELAY_MS);
    }

    setSummary(
      `${success} carte(s) sauvegardées en brouillon` +
      (skipped > 0 ? ` — ${skipped} doublon(s) ignoré(s)` : '') +
      (errors > 0 ? ` — ${errors} échec(s)` : ''),
    );
    setRunning(false);
  }

  const done = results.filter((r) => r.status === 'done').length;
  const total = pairs.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const isDone = !running && summary !== '' && draftCount > 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setActiveView('collection')}
            className="text-sm transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            ← Retour
          </button>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Import en lot
          </h2>
        </div>

        {/* Instructions */}
        <div
          className="rounded-2xl p-5 mb-4 text-sm"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          Sélectionne plusieurs images triées par nom — elles sont appairées automatiquement :{' '}
          <span style={{ color: 'var(--text-primary)' }}>image 1 = face, image 2 = dos…</span>
          <br />Les cartes sont sauvegardées en <strong style={{ color: 'var(--accent)' }}>brouillon</strong> — tu pourras les corriger avant de les valider dans la collection.
        </div>

        {/* Quota */}
        {quota && <div className="mb-4"><QuotaBar quota={quota} /></div>}

        {/* Méthode d'appairage */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Méthode de détection des paires</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="method" value="sequential" checked={method === 'sequential'} onChange={() => { setMethod('sequential'); if (allFiles.current.length) reparseFiles(allFiles.current, 'sequential'); }} className="mt-0.5 accent-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Numéros consécutifs</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>img1.jpg, img2.jpg, img3.jpg, img4.jpg → paire 1 + 2, paire 3 + 4…</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="method" value="suffix" checked={method === 'suffix'} onChange={() => { setMethod('suffix'); if (allFiles.current.length) reparseFiles(allFiles.current, 'suffix'); }} className="mt-0.5 accent-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Suffixe Recto / Verso</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Nom - Recto.jpg + Nom - Verso.jpg<br />
                  Suffixes reconnus : Recto, Front, Face, R / Verso, Back, Dos, V
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* File input */}
        <div
          className="rounded-2xl border-2 border-dashed p-8 mb-6 flex flex-col items-center gap-3 cursor-pointer transition-colors"
          style={{ borderColor: pairs.length > 0 ? 'var(--accent)' : 'var(--border)' }}
          onClick={() => !running && fileRef.current?.click()}
        >
          <div className="text-3xl">📂</div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {pairs.length > 0 ? `${pairs.length} paire(s) sélectionnée(s)` : 'Cliquer pour sélectionner les images'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {pairs.length > 0 ? 'Cliquer pour changer la sélection' : 'Sélection multiple — JPG, PNG, HEIC'}
          </p>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        </div>

        {pairs.length > 0 && (
          <>
            {/* Header actions */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{pairs.length}</span> paire(s)
                {unpaired && <span className="ml-3 text-yellow-500">⚠ "{unpaired}" sans paire</span>}
              </div>
              {!running && !isDone && (
                <button
                  onClick={runBatch}
                  className="px-5 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 20px var(--accent-glow)' }}
                >
                  Lancer l'identification
                </button>
              )}
            </div>

            {/* Progress */}
            {(running || isDone) && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span>{running ? 'Identification en cours…' : 'Terminé'}</span>
                  <span>{done}/{total}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, background: 'var(--accent)' }}
                  />
                </div>
              </div>
            )}

            {/* Summary + CTA review */}
            {isDone && (
              <div
                className="mb-6 px-4 py-4 rounded-xl flex items-center justify-between gap-4"
                style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{summary}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Prêtes à être vérifiées et validées.
                  </p>
                </div>
                <button
                  onClick={() => setActiveView('review')}
                  className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'var(--accent)', color: '#0d0c0b' }}
                >
                  Revoir les cartes →
                </button>
              </div>
            )}

            {/* Pair list */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                  style={{
                    borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                    background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                  }}
                >
                  <span className="w-6 text-xs font-bold shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {r.pair.front.name} + {r.pair.back.name}
                    </p>
                    {r.error && (
                      <p className="text-xs truncate" style={{ color: 'var(--red)' }}>{r.error}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-base">
                    {r.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>·</span>}
                    {r.status === 'running' && <span className="animate-spin inline-block" style={{ color: 'var(--accent)' }}>⟳</span>}
                    {r.status === 'done' && <span style={{ color: 'var(--green)' }}>✓</span>}
                    {r.status === 'error' && <span style={{ color: 'var(--red)' }}>✕</span>}
                    {r.status === 'skipped' && <span style={{ color: 'var(--text-muted)' }}>⊘</span>}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
