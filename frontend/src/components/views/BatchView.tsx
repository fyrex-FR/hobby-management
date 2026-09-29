import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileStack, Layers, RefreshCw, Sparkles, SplitSquareHorizontal, Upload } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { compressImage } from '../../lib/storage';
import { useAppStore } from '../../stores/appStore';
import type { ImportBatch, ImportClassification, ImportItem } from '../../types';
import { Badge, Notice, Page, PageHeader, Panel } from '../ui';

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

const TONES: Record<ImportClassification, 'neutral' | 'accent' | 'green' | 'red' | 'blue'> = {
  processing: 'neutral', match: 'blue', probable: 'accent', new: 'green', insufficient: 'neutral', error: 'red',
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

  const percent = items.length ? Math.round((processedCount / items.length) * 100) : 0;

  return (
    <Page>
      <PageHeader
        title="Sas d’import"
        subtitle="Identifier et trier avant d’ajouter à la collection"
        actions={
          <button onClick={() => setActiveView('collection')} className="ui-btn ui-btn-ghost">
            <ChevronLeft size={16} /> Collection
          </button>
        }
      />

      <Panel title="1. Choisir les photos" icon={Upload}>
        <div className="space-y-4">
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-[var(--text-primary)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={frontOnly}
              onChange={(event) => { const checked = event.target.checked; setFrontOnly(checked); if (allFiles.current.length) selectFiles(allFiles.current, pairMode, checked); }}
            />
            Photos recto uniquement <span className="text-[var(--text-muted)]">(confiance réduite)</span>
          </label>

          {!frontOnly && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Appairage recto / verso</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ['sequential', 'Consécutif', '1-2, 3-4, 5-6…', FileStack],
                  ['halves', 'Moitiés', 'Tous rectos, puis tous versos', SplitSquareHorizontal],
                  ['suffix', 'Suffixes', '_recto / _verso', Layers],
                ] as const).map(([id, label, description, Icon]) => {
                  const active = pairMode === id;
                  return (
                    <button
                      key={id}
                      disabled={running}
                      onClick={() => { setPairMode(id); if (allFiles.current.length) selectFiles(allFiles.current, id, false); }}
                      aria-pressed={active}
                      className={`flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? 'border-[var(--border-accent)] bg-[var(--accent-dim)]'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <span className={`flex items-center gap-2 text-[13px] font-medium ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                        <Icon size={15} /> {label}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => inputRef.current?.click()}
            disabled={running}
            className="group flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-secondary)] px-4 py-8 text-center transition-colors hover:border-[var(--border-accent)] hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${items.length ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] group-hover:text-[var(--accent)]'}`}>
              {items.length ? <CheckCircle2 size={22} /> : <Upload size={22} />}
            </span>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {items.length ? `${items.length} carte(s) prête(s)` : 'Choisir les photos'}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {frontOnly ? 'Une photo par carte' : 'Ordre attendu : recto 1, verso 1, recto 2, verso 2…'}
            </span>
            {items.length > 0 && !running && <span className="text-xs text-[var(--text-secondary)] underline-offset-2 group-hover:underline">Changer la sélection</span>}
          </button>
          <input ref={inputRef} hidden type="file" accept="image/*" multiple onChange={(event) => selectFiles(Array.from(event.target.files || []), pairMode, frontOnly)} />

          {error && (
            <Notice tone={error.startsWith('Photos non appairées') ? 'warning' : 'error'} icon={AlertCircle}>
              {error}
            </Notice>
          )}
        </div>
      </Panel>

      {items.length > 0 && (
        <Panel
          title="2. Analyse IA"
          icon={Sparkles}
          action={<span className="tabular text-xs text-[var(--text-muted)]">{processedCount} / {items.length}</span>}
          padded={false}
        >
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{running && currentIndex !== null ? `Analyse de la carte ${currentIndex + 1} sur ${items.length}…` : completedBatchId ? 'Analyse terminée' : 'Traitement carte par carte'}</span>
              <span className="tabular">{percent} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${percent}%` }} />
            </div>
            {Object.entries(counts).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(counts).map(([key, value]) => (
                  <Badge key={key} tone={TONES[key as ImportClassification]}>
                    {LABELS[key as ImportClassification]} <span className="tabular">· {value}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
            {items.map((item, index) => {
              const row = progress[index];
              const result = results[index];
              return (
                <div
                  key={`${item.front.name}-${index}`}
                  className={`flex items-center gap-3 px-4 py-2.5 ${currentIndex === index ? 'bg-[var(--accent-dim)]' : ''}`}
                >
                  <span className="tabular w-6 shrink-0 text-xs text-[var(--text-muted)]">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {item.front.name}{item.back ? ` + ${item.back.name}` : ''}
                    </span>
                    <span className={`block truncate text-xs ${row?.state === 'error' ? 'text-[var(--red)]' : 'text-[var(--text-muted)]'}`}>
                      {row?.error || row?.step || (result ? LABELS[result.classification] : 'En attente')}
                    </span>
                  </span>
                  {row?.state === 'running' ? (
                    <RefreshCw size={15} className="shrink-0 animate-spin text-[var(--accent)]" />
                  ) : row?.state === 'done' ? (
                    result ? <Badge tone={TONES[result.classification]}>{LABELS[result.classification]}</Badge> : <CheckCircle2 size={16} className="shrink-0 text-[var(--green)]" />
                  ) : row?.state === 'error' ? (
                    <Badge tone="red">Erreur</Badge>
                  ) : (
                    <Badge>En attente</Badge>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-[var(--border)] p-4">
            {!completedBatchId ? (
              <button onClick={run} disabled={running} className="ui-btn ui-btn-primary ui-btn-lg w-full">
                {running && currentIndex !== null ? (
                  <><RefreshCw size={16} className="animate-spin" /> Analyse {currentIndex + 1}/{items.length}</>
                ) : (
                  <>Créer le sas et analyser <ArrowRight size={16} /></>
                )}
              </button>
            ) : (
              <button onClick={() => { setImportBatchId(completedBatchId); setActiveView('import_review'); }} className="ui-btn ui-btn-primary ui-btn-lg w-full">
                3. Revoir les rapprochements <ArrowRight size={16} />
              </button>
            )}
          </div>
        </Panel>
      )}

      {history.length > 0 && (
        <Panel title="Imports récents" icon={Clock3} padded={false}>
          <div className="divide-y divide-[var(--border)]">
            {history.slice(0, 8).map((batch) => (
              <button
                key={batch.id}
                onClick={() => resume(batch.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{batch.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{new Date(batch.created_at).toLocaleString('fr-FR')}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
        </Panel>
      )}
    </Page>
  );
}
