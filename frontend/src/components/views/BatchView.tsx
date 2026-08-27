import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, Clock3, Upload } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { compressImage } from '../../lib/storage';
import { useAppStore } from '../../stores/appStore';
import type { ImportBatch, ImportClassification, ImportItem } from '../../types';

interface LocalItem { front: File; back?: File }

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
  const [frontOnly, setFrontOnly] = useState(false);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [results, setResults] = useState<Array<ImportItem | null>>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { apiFetch<ImportBatch[]>('/imports').then(setHistory).catch(() => setHistory([])); }, []);

  function selectFiles(files: File[]) {
    const sorted = files.filter((file) => file.type.startsWith('image/')).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    const next: LocalItem[] = [];
    if (frontOnly) sorted.forEach((front) => next.push({ front }));
    else for (let index = 0; index + 1 < sorted.length; index += 2) next.push({ front: sorted[index], back: sorted[index + 1] });
    setItems(next);
    setResults(next.map(() => null));
    setError(!frontOnly && sorted.length % 2 ? 'Une photo est orpheline et ne sera pas traitée.' : '');
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
        try {
          const [front_base64, back_base64] = await Promise.all([
            fileToBase64(item.front), item.back ? fileToBase64(item.back) : Promise.resolve(undefined),
          ]);
          const analyzed = await apiFetch<ImportItem>(`/imports/${batch.id}/items/analyze`, {
            method: 'POST', body: JSON.stringify({
              front_base64, back_base64, position: index,
              front_filename: item.front.name, back_filename: item.back?.name,
            }),
          }, 90000);
          setResults((current) => current.map((value, position) => position === index ? analyzed : value));
        } catch (itemError) {
          setError(`Carte ${index + 1} : ${(itemError as Error).message}`);
        }
      }
      setActiveView('import_review');
    } catch (batchError) {
      setError((batchError as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const counts = useMemo(() => results.reduce<Record<string, number>>((acc, item) => {
    if (item) acc[item.classification] = (acc[item.classification] || 0) + 1;
    return acc;
  }, {}), [results]);

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
          <input type="checkbox" checked={frontOnly} onChange={(event) => { setFrontOnly(event.target.checked); setItems([]); }} />
          Photos recto uniquement <span className="text-[var(--text-muted)]">(confiance réduite)</span>
        </label>
        <button onClick={() => inputRef.current?.click()} disabled={running} className="w-full min-h-48 rounded-3xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-3 hover:border-[var(--accent)]">
          <Upload size={32} /><strong>{items.length ? `${items.length} carte(s) prête(s)` : 'Choisir les photos'}</strong>
          <span className="text-xs text-[var(--text-muted)]">{frontOnly ? 'Une photo par carte' : 'Ordre attendu : recto 1, verso 1, recto 2, verso 2…'}</span>
        </button>
        <input ref={inputRef} hidden type="file" accept="image/*" multiple onChange={(event) => selectFiles(Array.from(event.target.files || []))} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {items.length > 0 && <button onClick={run} disabled={running} className="w-full py-4 rounded-2xl bg-[var(--accent)] text-black font-black flex justify-center gap-2">
          {running ? `Analyse ${results.filter(Boolean).length + 1}/${items.length}` : 'Créer le sas et analyser'} <ArrowRight size={18} />
        </button>}
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
