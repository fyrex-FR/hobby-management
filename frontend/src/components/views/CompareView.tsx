import { useRef, useState } from 'react';
import {
  Scan,
  ChevronLeft,
  Zap,
  Scale,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Info,
  ImagePlus,
  Layers,
  Sparkles,
  Camera,
  Hash,
  Star,
  Tag,
  Clock
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { apiFetch } from '../../api/client';
import { compressImage } from '../../lib/storage';
import { EmptyState, Notice, Page, PageHeader, Panel } from '../ui';

// ── types ──────────────────────────────────────────────────────────────────
interface CardResult {
  player?: string;
  team?: string;
  year?: string;
  brand?: string;
  set?: string;
  insert?: string;
  parallel?: string;
  parallel_confidence?: number;
  card_number?: string;
  numbered?: string;
  is_rookie?: boolean;
  condition_notes?: string;
  card_type?: string;
  _meta: { latency_ms: number; cost_usd: number; error: string | null };
}

interface CompareResponse {
  id: string;
  haiku: CardResult;
  gemini: CardResult;
}

interface StatsResponse {
  total_scored: number;
  wins?: { haiku: number; gemini: number; tie: number; both_wrong: number };
  avg_cost_usd?: { haiku: number | null; gemini: number | null };
  avg_latency_ms?: { haiku: number | null; gemini: number | null };
}

// ── helpers ────────────────────────────────────────────────────────────────
const FIELDS = [
  { key: 'player', label: 'Joueur', icon: Tag },
  { key: 'team', label: 'Équipe', icon: Tag },
  { key: 'year', label: 'Année', icon: Star },
  { key: 'brand', label: 'Marque', icon: Layers },
  { key: 'set', label: 'Set', icon: Layers },
  { key: 'insert', label: 'Insert', icon: Sparkles },
  { key: 'parallel', label: 'Parallel', icon: Sparkles },
  { key: 'parallel_confidence', label: 'Confiance', icon: Info },
  { key: 'card_number', label: 'N° carte', icon: Hash },
  { key: 'numbered', label: 'Tirage', icon: Hash },
  { key: 'is_rookie', label: 'RC', icon: Star },
  { key: 'card_type', label: 'Type', icon: Info },
  { key: 'condition_notes', label: 'État', icon: Clock },
] as const;

function fmt(val: unknown): string {
  if (val === undefined || val === null || val === '') return '—';
  return String(val);
}


const HAIKU_COLOR = 'var(--accent)';
const GEMINI_COLOR = 'var(--blue)';

function ImageDropzone({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const preview = file ? URL.createObjectURL(file) : null;

  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className={`group relative aspect-[3/4] w-full overflow-hidden rounded-xl border transition-colors ${
        preview
          ? 'border-[var(--border)] hover:border-[var(--border-strong)]'
          : 'border-dashed border-[var(--border-strong)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)]'
      }`}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center dark-scope bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="ui-btn ui-btn-sm pointer-events-none">Changer</span>
          </div>
          <span className="absolute bottom-2 left-2 inline-flex h-5 items-center rounded-md dark-scope bg-black/70 px-1.5 text-[11px] font-medium text-[var(--text-primary)] ring-1 ring-white/10">
            {label}
          </span>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-secondary)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
            <Camera size={20} />
          </div>
          <span className="text-[13px] font-medium">{label}</span>
          <span className="flex items-center gap-1 text-xs"><ImagePlus size={12} /> Choisir une photo</span>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }} />
    </button>
  );
}

function ResultColumn({
  label,
  color,
  result,
  other,
  winner,
  onScore,
}: {
  label: string;
  color: string;
  result: CardResult;
  other: CardResult;
  winner: string | null;
  onScore: () => void;
}) {
  const isWinner = winner === label.toLowerCase();
  const hasError = !!result._meta.error;

  return (
    <section className="ui-card overflow-hidden" style={isWinner ? { borderColor: color } : undefined}>
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        </div>
        <div className="tabular flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>{result._meta.latency_ms} ms</span>
          <span>${(result._meta.cost_usd * 100).toFixed(3)}¢</span>
        </div>
      </header>

      {hasError && (
        <div className="p-4">
          <Notice tone="error">{result._meta.error}</Notice>
        </div>
      )}

      {!hasError && (
        <dl className="p-2">
          {FIELDS.map(({ key, label: fieldLabel, icon: Icon }) => {
            const val = fmt(result[key as keyof CardResult]);
            const otherVal = fmt(other[key as keyof CardResult]);
            const differs = val !== otherVal && val !== '—' && otherVal !== '—';

            return (
              <div key={key} className={`flex items-center justify-between gap-4 rounded-lg px-2.5 py-1.5 ${differs ? 'bg-[var(--bg-elevated)]' : ''}`}>
                <dt className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <Icon size={12} />
                  {fieldLabel}
                </dt>
                <dd
                  className={`truncate text-right text-[13px] ${differs ? 'font-medium' : 'text-[var(--text-secondary)]'}`}
                  style={{ color: differs ? color : undefined }}
                >
                  {val}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {!hasError && !winner && (
        <div className="border-t border-[var(--border)] p-3">
          <button onClick={onScore} className="ui-btn w-full">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            Élire {label}
          </button>
        </div>
      )}

      {isWinner && (
        <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] px-4 py-2.5 text-[13px] font-medium" style={{ color }}>
          <CheckCircle2 size={15} />
          Gagnant sélectionné
        </div>
      )}
    </section>
  );
}

function StatsBar({ stats }: { stats: StatsResponse }) {
  if (!stats.total_scored || !stats.wins) return null;
  const total = stats.total_scored;
  const haikuPct = Math.round((stats.wins.haiku / total) * 100);
  const geminiPct = Math.round((stats.wins.gemini / total) * 100);

  return (
    <Panel title="Résultats cumulés" icon={Scale}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Tests notés</p>
            <p className="tabular text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{total}</p>
          </div>
          {stats.avg_cost_usd && (
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">Coût moyen</p>
              <p className="tabular text-[13px] font-medium">
                <span style={{ color: HAIKU_COLOR }}>${(stats.avg_cost_usd.haiku! * 100).toFixed(2)}¢</span>
                <span className="mx-2 text-[var(--text-muted)]">/</span>
                <span style={{ color: GEMINI_COLOR }}>${(stats.avg_cost_usd.gemini! * 100).toFixed(2)}¢</span>
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between text-[13px]">
            <div>
              <span className="font-medium" style={{ color: HAIKU_COLOR }}>Haiku {haikuPct}%</span>
              <span className="tabular ml-2 text-xs text-[var(--text-muted)]">{stats.wins.haiku} victoires</span>
            </div>
            <div className="text-right">
              <span className="tabular mr-2 text-xs text-[var(--text-muted)]">{stats.wins.gemini} victoires</span>
              <span className="font-medium" style={{ color: GEMINI_COLOR }}>Gemini {geminiPct}%</span>
            </div>
          </div>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="h-full transition-[width] duration-300" style={{ width: `${haikuPct}%`, background: HAIKU_COLOR }} />
            <div className="ml-auto h-full transition-[width] duration-300" style={{ width: `${geminiPct}%`, background: GEMINI_COLOR }} />
          </div>
          <div className="flex justify-center gap-6 pt-1 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--text-muted)]" /><span className="tabular">{stats.wins.tie}</span> égalités</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--red)]" /><span className="tabular">{stats.wins.both_wrong}</span> les deux faux</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function CompareView() {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  async function loadStats() {
    try {
      const s = await apiFetch<StatsResponse>('/compare/stats');
      setStats(s);
    } catch {
      /* stats indisponibles : on garde les précédentes */
    }
  }

  useState(() => { loadStats(); });

  async function handleCompare() {
    if (!frontFile || !backFile) return;
    setError('');
    setResult(null);
    setWinner(null);
    setLoading(true);
    try {
      const [frontBlob, backBlob] = await Promise.all([compressImage(frontFile), compressImage(backFile)]);
      function blobToB64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      const [frontB64, backB64] = await Promise.all([blobToB64(frontBlob), blobToB64(backBlob)]);
      const res = await apiFetch<CompareResponse>('/compare', {
        method: 'POST',
        body: JSON.stringify({ front_base64: frontB64, back_base64: backB64 }),
      });
      setResult(res);
      await loadStats();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleScore(w: 'haiku' | 'gemini' | 'tie' | 'both_wrong') {
    if (!result) return;
    setScoring(true);
    try {
      await apiFetch(`/compare/${result.id}/score`, {
        method: 'POST',
        body: JSON.stringify({ winner: w }),
      });
      setWinner(w);
      await loadStats();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScoring(false);
    }
  }

  const canCompare = !!frontFile && !!backFile;

  return (
    <Page>
      <PageHeader
        title="Comparer IA"
        subtitle="Haiku vs Gemini Flash sur les mêmes photos"
        actions={
          <button onClick={() => setActiveView('dashboard')} className="ui-btn ui-btn-ghost">
            <ChevronLeft size={16} /> Retour
          </button>
        }
      />

      {stats && <StatsBar stats={stats} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Panel title="Photos de la carte" icon={Camera}>
            <div className="grid grid-cols-2 gap-3">
              <ImageDropzone label="Recto" file={frontFile} onChange={setFrontFile} />
              <ImageDropzone label="Verso" file={backFile} onChange={setBackFile} />
            </div>
          </Panel>

          <button onClick={handleCompare} disabled={!canCompare || loading} className="ui-btn ui-btn-primary ui-btn-lg w-full">
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? 'Analyse en cours…' : 'Lancer la comparaison'}
          </button>

          {error && <Notice tone="error" icon={XCircle}>{error}</Notice>}
        </div>

        <div className="space-y-4">
          {!result && (
            <div className="ui-card">
              <EmptyState
                icon={Scan}
                title="En attente de photos"
                description="Charge le recto et le verso d'une carte pour comparer les deux modèles."
              />
            </div>
          )}

          {result && (
            <>
              <ResultColumn
                label="Haiku"
                color={HAIKU_COLOR}
                result={result.haiku}
                other={result.gemini}
                winner={winner}
                onScore={() => handleScore('haiku')}
              />
              <ResultColumn
                label="Gemini"
                color={GEMINI_COLOR}
                result={result.gemini}
                other={result.haiku}
                winner={winner}
                onScore={() => handleScore('gemini')}
              />
            </>
          )}

          {result && !winner && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleScore('tie')} disabled={scoring} className="ui-btn">
                Égalité
              </button>
              <button onClick={() => handleScore('both_wrong')} disabled={scoring} className="ui-btn">
                Les deux faux
              </button>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
