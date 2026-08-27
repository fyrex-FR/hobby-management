import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, Clock3, FileStack, Layers, RefreshCw, SplitSquareHorizontal, Upload } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { compressImage } from '../../lib/storage';
import { useAppStore } from '../../stores/appStore';
import type { ImportBatch, ImportClassification, ImportItem } from '../../types';

interface LocalItem { front: File; back?: File }
type PairMode = 'sequential' | 'halves' | 'suffix';
type RowState = 'pending' | 'running' | 'done' | 'error';
interface RowProgress { state: RowState; step?: string; error?: string }

const FRONT_SUFFIXES = ['recto', 'front', 'face', 'r'];
const BACK_SUFFIXES = ['verso', 'back', 'dos', 'v'];

const LABELS: Record<ImportClassification, string> = {
  processing: 'Analyse…', match: 'Déjà en collection', probable: 'À vérifier', new: 'Nouvelle carte',
  insufficient: 'Identification insuffisante', error: 'Erreur',
};

async function fileToBase64(file: File): Promise<string> {
  const blob = await compressImage(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export function BatchView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setImportBatchId = useAppStore((state) => state.setImportBatchId);
  const allFiles = useRef<File[]>([]);
  const [frontOnly, setFrontOnly] = useState(false);
  const [pairMode, setPairMode] = useState<PairMode>('sequential');
  const [items, setItems] = useState<LocalItem[]>([]);
  const [results, setResults] = useState<Array<ImportItem | null>>([]);
  const [progress, setProgress] = useState<RowProgress[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [completedBatchId, setCompletedBatchId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { apiFetch<ImportBatch[]>('/imports').then(setHistory).catch(() => setHistory([])); }, []);

  function selectFiles(files: File[], mode = pairMode, onlyFront = frontOnly) {
    const sorted = files.filter((file) => file.type.startsWith('image/')).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    allFiles.current = sorted;
    const next: LocalItem[] = [];
    const orphaned: string[] = [];
    if (onlyFront) sorted.forEach((front) => next.push({ front }));
    else if (mode === 'halves') {
      const half = Math.floor(sorted.length / 2);
      for (let index = 0; index < half; index += 1) next.push({ front: sorted[index], back: sorted[half + index] });
      if (sorted.length % 2) orphaned.push(sorted[half].name);
    } else if (mode === 'suffix') {
      const fronts = new Map<string, File>();
      const backs = new Map<string, File>();
      sorted.forEach((file) => {
        const stem = file.name.replace(/\.[^.]+$/, '');
        const match = stem.match(/^(.*?)[\s_-]+([a-zA-Z]+)$/);
        const suffix = match?.[2].toLowerCase() || '';
        const base = (match?.[1] || stem).trim().toLowerCase();
        if (FRONT_SUFFIXES.includes(suffix)) fronts.set(base, file);
        else if (BACK_SUFFIXES.includes(suffix)) backs.set(base, file);
        else orphaned.push(file.name);
      });
      fronts.forEach((front, base) => {
        const back = backs.get(base);
        if (back) { next.push({ front, back }); backs.delete(base); }
        else orphaned.push(front.name);
      });
      backs.forEach((file) => orphaned.push(file.name));
    } else {
      for (let index = 0; index + 1 < sorted.length; index += 2) next.push({ front: sorted[index], back: sorted[index + 1] });
      if (sorted.length % 2) orphaned.push(sorted.at(-1)!.name);
    }
    setItems(next);
    setResults(next.map(() => null));
    setProgress(next.map(() => ({ state: 'pending' })));
    setCompletedBatchId(null);
    setError(orphaned.length ? `Photos non appairées : ${orphaned.join(', ')}` : '');
  }

  async function run() {
    if (!items.length || running) return;
    setRunning(true);
    setError('');
    try {
      const batch = await apiFetch<ImportBatch>('/imports', {
        method: 'POST', body: JSON.stringify({ name: `Lot du ${new Date().toLocaleString('fr-FR')}` }),
      });
      setImportBatchId(batch.id);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setCurrentIndex(index);
        setProgress((current) => current.map((row, position) => position === index ? { state: 'running', step: 'Optimisation des photos' } : row));
        try {
          const [front_base64, back_base64] = await Promise.all([
            fileToBase64(item.front), item.back ? fileToBase64(item.back) : Promise.resolve(undefined),
          ]);
          setProgress((current) => current.map((row, position) => position === index ? { state: 'running', step: 'Identification IA et rapprochement' } : row));
          const analyzed = await apiFetch<ImportItem>(`/imports/${batch.id}/items/analyze`, {
            method: 'POST', body: JSON.stringify({
              front_base64, back_base64, position: index,
              front_filename: item.front.name, back_filename: item.back?.name,
            }),
          }, 90000);
          setResults((current) => current.map((value, position) => position === index ? analyzed : value));
          setProgress((current) => current.map((row, position) => position === index ? {
            state: analyzed.classification === 'error' ? 'error' : 'done',
            error: analyzed.error || undefined,
          } : row));
        } catch (itemError) {
          const message = (itemError as Error).message;
          setProgress((current) => current.map((row, position) => position === index ? { state: 'error', error: message } : row));
          setError(`Carte ${index + 1} : ${message}`);
        }
      }
      setCompletedBatchId(batch.id);
    } catch (batchError) {
      setError((batchError as Error).message);
    } finally {
      setCurrentIndex(null);
      setRunning(false);
    }
  }

  const counts = useMemo(() => results.reduce<Record<string, number>>((acc, item) => {
    if (item) acc[item.classification] = (acc[item.classification] || 0) + 1;
    return acc;
  }, {}), [results]);
  const processedCount = progress.filter((row) => row.state === 'done' || row.state === 'error').length;

  function resume(batchId: string) {
    setImportBatchId(batchId);
    setActiveView('import_review');
  }

  return (
    <div className="max-w-5xl mx-auto p-6 sm:p-10 space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => setActiveView('collection')} className="p-3 rounded-xl bg-white/5"><ChevronLeft size={18} /></button>
        <div><h1 className="text-2xl font-black">Sas d’import</h1><p className="text-sm text-[var(--text-muted)]">Identifier et trier avant d’ajouter à la collection</p></div>
      </div>

      <div className="panel rounded-3xl p-6 space-y-5">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={frontOnly} onChange={(event) => { const checked = event.target.checked; setFrontOnly(checked); if (allFiles.current.length) selectFiles(allFiles.current, pairMode, checked); }} />
          Photos recto uniquement <span className="text-[var(--text-muted)]">(confiance réduite)</span>
        </label>
        {!frontOnly && <div className="grid sm:grid-cols-3 gap-2">
          {([
            ['sequential', 'Consécutif', '1-2, 3-4, 5-6…', FileStack],
            ['halves', 'Moitiés', 'Tous rectos, puis tous versos', SplitSquareHorizontal],
            ['suffix', 'Suffixes', '_recto / _verso', Layers],
          ] as const).map(([id, label, description, Icon]) => <button key={id} disabled={running} onClick={() => { setPairMode(id); if (allFiles.current.length) selectFiles(allFiles.current, id, false); }} className="p-3 rounded-2xl text-left" style={{ background: pairMode === id ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: pairMode === id ? '1px solid var(--border-accent)' : '1px solid var(--border)' }}>
            <span className="flex items-center gap-2 font-bold text-sm"><Icon size={16} /> {label}</span><small className="text-[var(--text-muted)]">{description}</small>
          </button>)}
        </div>}
        <button onClick={() => inputRef.current?.click()} disabled={running} className="w-full min-h-48 rounded-3xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-3 hover:border-[var(--accent)]">
          <Upload size={32} /><strong>{items.length ? `${items.length} carte(s) prête(s)` : 'Choisir les photos'}</strong>
          <span className="text-xs text-[var(--text-muted)]">{frontOnly ? 'Une photo par carte' : 'Ordre attendu : recto 1, verso 1, recto 2, verso 2…'}</span>
        </button>
        <input ref={inputRef} hidden type="file" accept="image/*" multiple onChange={(event) => selectFiles(Array.from(event.target.files || []), pairMode, frontOnly)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {items.length > 0 && <div className="space-y-2">
          <div className="flex justify-between text-xs text-[var(--text-muted)]"><span>Traitement carte par carte</span><span>{processedCount} / {items.length}</span></div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${items.length ? Math.round((processedCount / items.length) * 100) : 0}%` }} /></div>
          <div className="max-h-80 overflow-y-auto rounded-2xl border border-white/5 divide-y divide-white/5">
            {items.map((item, index) => <div key={`${item.front.name}-${index}`} className="p-3 flex items-center gap-3" style={{ background: currentIndex === index ? 'var(--accent-dim)' : undefined }}>
              <span className="w-7 text-xs text-[var(--text-muted)]">{index + 1}</span>
              <span className="min-w-0 flex-1"><strong className="block text-sm truncate">{item.front.name}{item.back ? ` + ${item.back.name}` : ''}</strong><small className={progress[index]?.state === 'error' ? 'text-red-400' : 'text-[var(--text-muted)]'}>{progress[index]?.error || progress[index]?.step || (results[index] ? LABELS[results[index]!.classification] : 'En attente')}</small></span>
              {progress[index]?.state === 'running' ? <RefreshCw size={16} className="animate-spin text-[var(--accent)]" /> : progress[index]?.state === 'done' ? <CheckCircle2 size={17} className="text-green-400" /> : <span className="text-xs uppercase text-[var(--text-muted)]">{progress[index]?.state}</span>}
            </div>)}
          </div>
        </div>}
        {items.length > 0 && !completedBatchId && <button onClick={run} disabled={running} className="w-full py-4 rounded-2xl bg-[var(--accent)] text-black font-black flex justify-center gap-2">
          {running && currentIndex !== null ? `Analyse ${currentIndex + 1}/${items.length}` : 'Créer le sas et analyser'} <ArrowRight size={18} />
        </button>}
        {completedBatchId && <button onClick={() => { setImportBatchId(completedBatchId); setActiveView('import_review'); }} className="w-full py-4 rounded-2xl bg-white text-black font-black flex justify-center gap-2">Revoir les rapprochements <ArrowRight size={18} /></button>}
        {Object.entries(counts).length > 0 && <div className="flex flex-wrap gap-2">{Object.entries(counts).map(([key, value]) =>
          <span key={key} className="px-3 py-1.5 rounded-full bg-white/5 text-xs">{LABELS[key as ImportClassification]} · {value}</span>,
        )}</div>}
      </div>

      {history.length > 0 && <div className="space-y-3">
        <h2 className="text-sm font-bold flex items-center gap-2"><Clock3 size={16} /> Imports récents</h2>
        {history.slice(0, 8).map((batch) => <button key={batch.id} onClick={() => resume(batch.id)} className="panel w-full p-4 rounded-2xl flex justify-between text-left">
          <span><strong>{batch.name}</strong><small className="block text-[var(--text-muted)]">{new Date(batch.created_at).toLocaleString('fr-FR')}</small></span>
          <CheckCircle2 size={18} className="text-[var(--accent)]" />
        </button>)}
      </div>}
    </div>
  );
}
