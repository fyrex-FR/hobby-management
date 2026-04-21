import { useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { apiFetch } from '../../api/client';
import { compressImage } from '../../lib/storage';

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
  { key: 'player', label: 'Joueur' },
  { key: 'team', label: 'Équipe' },
  { key: 'year', label: 'Année' },
  { key: 'brand', label: 'Marque' },
  { key: 'set', label: 'Set' },
  { key: 'insert', label: 'Insert' },
  { key: 'parallel', label: 'Parallel' },
  { key: 'parallel_confidence', label: 'Confiance parallel' },
  { key: 'card_number', label: 'N° carte' },
  { key: 'numbered', label: 'Tirage' },
  { key: 'is_rookie', label: 'RC' },
  { key: 'card_type', label: 'Type' },
  { key: 'condition_notes', label: 'État' },
] as const;

function fmt(val: unknown): string {
  if (val === undefined || val === null || val === '') return '—';
  return String(val);
}

function ImageDropzone({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const preview = file ? URL.createObjectURL(file) : null;
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative flex-1 rounded-2xl overflow-hidden border-2 transition-all"
      style={{
        aspectRatio: '2/3',
        borderColor: preview ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
        borderStyle: preview ? 'solid' : 'dashed',
        background: preview ? 'transparent' : 'var(--bg-secondary)',
      }}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm font-medium">Changer</span>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-xl">📷</div>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }} />
    </button>
  );
}

// ── result column ──────────────────────────────────────────────────────────
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
    <div
      className="flex-1 rounded-2xl overflow-hidden"
      style={{
        border: isWinner ? `1.5px solid ${color}` : '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        boxShadow: isWinner ? `0 0 20px ${color}30` : 'none',
        transition: 'box-shadow 0.2s, border 0.2s',
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span>{result._meta.latency_ms} ms</span>
          <span>${(result._meta.cost_usd * 100).toFixed(3)} ¢</span>
        </div>
      </div>

      {/* error state */}
      {hasError && (
        <div className="m-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {result._meta.error}
        </div>
      )}

      {/* fields */}
      {!hasError && (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {FIELDS.map(({ key, label: fieldLabel }) => {
            const val = fmt(result[key as keyof CardResult]);
            const otherVal = fmt(other[key as keyof CardResult]);
            const differs = val !== otherVal && val !== '—' && otherVal !== '—';
            return (
              <div key={key} className="flex items-start justify-between px-4 py-2.5 gap-2">
                <span className="text-[11px] shrink-0 w-24" style={{ color: 'var(--text-muted)' }}>{fieldLabel}</span>
                <span
                  className="text-xs text-right font-medium"
                  style={{ color: differs ? color : 'var(--text-primary)' }}
                >
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* vote button */}
      {!hasError && !winner && (
        <div className="p-3">
          <button
            onClick={onScore}
            className="w-full py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: color, color: '#0d0c0b' }}
          >
            ✓ {label} est meilleur
          </button>
        </div>
      )}

      {isWinner && (
        <div className="mx-3 mb-3 py-2 rounded-xl text-xs font-semibold text-center" style={{ background: `${color}20`, color }}>
          ✓ Gagnant
        </div>
      )}
    </div>
  );
}

// ── stats bar ──────────────────────────────────────────────────────────────
function StatsBar({ stats }: { stats: StatsResponse }) {
  if (!stats.total_scored || !stats.wins) return null;
  const total = stats.total_scored;
  const haikuPct = Math.round((stats.wins.haiku / total) * 100);
  const geminiPct = Math.round((stats.wins.gemini / total) * 100);

  return (
    <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Scores cumulés — {total} comparaison{total > 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-4 text-center">
        {[
          { label: 'Haiku wins', value: stats.wins.haiku, color: '#F5AF23' },
          { label: 'Gemini wins', value: stats.wins.gemini, color: '#4285F4' },
          { label: 'Égalité', value: stats.wins.tie, color: 'var(--text-secondary)' },
          { label: 'Aucun bon', value: stats.wins.both_wrong, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div className="text-xl font-bold" style={{ color }}>{value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* win rate bar */}
      <div className="mt-4 flex gap-1 h-1.5 rounded-full overflow-hidden">
        <div style={{ width: `${haikuPct}%`, background: '#F5AF23' }} />
        <div style={{ width: `${geminiPct}%`, background: '#4285F4' }} />
      </div>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
        <span>Haiku {haikuPct}%</span>
        <span>Gemini {geminiPct}%</span>
      </div>

      {stats.avg_cost_usd && (
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          {[
            { label: 'Coût moy. Haiku', value: stats.avg_cost_usd.haiku, color: '#F5AF23' },
            { label: 'Coût moy. Gemini', value: stats.avg_cost_usd.gemini, color: '#4285F4' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="text-sm font-semibold" style={{ color }}>
                {value !== null ? `$${(value * 100).toFixed(3)} ¢` : '—'}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main view ──────────────────────────────────────────────────────────────
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
    } catch { /* silent */ }
  }

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
          reader.onload = () => {
            const b64 = (reader.result as string).split(',')[1];
            resolve(b64);
          };
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
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* breadcrumb */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => setActiveView('dashboard')} className="text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}>
            ← Accueil
          </button>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Comparaison IA</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Haiku vs Gemini Flash
          </span>
        </div>

        {/* stats */}
        {stats && stats.total_scored > 0 && <StatsBar stats={stats} />}

        {/* upload */}
        <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>Photos de la carte</p>
          <div className="flex gap-4" style={{ height: '240px' }}>
            <ImageDropzone label="Face" file={frontFile} onChange={setFrontFile} />
            <ImageDropzone label="Dos" file={backFile} onChange={setBackFile} />
          </div>
        </div>

        {/* launch */}
        <button
          onClick={handleCompare}
          disabled={!canCompare || loading}
          className="w-full mb-6 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
          style={
            !canCompare
              ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'not-allowed' }
              : { background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 20px var(--accent-glow)' }
          }
        >
          {loading ? (
            <><span className="animate-spin inline-block">⟳</span> Analyse en cours…</>
          ) : (
            <>⚡ Lancer la comparaison</>
          )}
        </button>

        {error && (
          <div className="mb-6 p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* results */}
        {result && (
          <>
            <div className="flex gap-4 mb-4">
              <ResultColumn
                label="Haiku"
                color="#F5AF23"
                result={result.haiku}
                other={result.gemini}
                winner={winner}
                onScore={() => handleScore('haiku')}
              />
              <ResultColumn
                label="Gemini"
                color="#4285F4"
                result={result.gemini}
                other={result.haiku}
                winner={winner}
                onScore={() => handleScore('gemini')}
              />
            </div>

            {/* extra votes */}
            {!winner && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleScore('tie')}
                  disabled={scoring}
                  className="flex-1 py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  Égalité
                </button>
                <button
                  onClick={() => handleScore('both_wrong')}
                  disabled={scoring}
                  className="flex-1 py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  Les deux faux
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
