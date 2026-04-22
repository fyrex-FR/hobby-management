import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scan,
  ChevronLeft,
  Zap,
  Scale,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Info,
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

function ImageDropzone({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const preview = file ? URL.createObjectURL(file) : null;

  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative flex-1 rounded-[32px] overflow-hidden border-2 transition-all group"
      style={{
        aspectRatio: '2/3',
        borderColor: preview ? 'white/10' : 'white/5',
        borderStyle: preview ? 'solid' : 'dashed',
        background: preview ? 'transparent' : 'white/[0.02]',
      }}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest">Changer</div>
          </div>
          <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-black tracking-[0.2em] text-white/70">
            {label.toUpperCase()}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/10 group-hover:text-white/20 transition-colors">
          <div className="w-16 h-16 rounded-[24px] bg-white/5 flex items-center justify-center">
            <Camera size={32} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
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
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 rounded-[32px] overflow-hidden bg-white/[0.02] border transition-all relative"
      style={{
        borderColor: isWinner ? color : 'white/10',
        boxShadow: isWinner ? `0 0 40px ${color}15` : 'none',
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white/[0.03] border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full shadow-[0_0_10px_currentcolor]" style={{ background: color, color }} />
          <span className="font-black text-xs uppercase tracking-widest text-white leading-none">{label}</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] uppercase font-black tracking-widest text-white/20">
          <span>{result._meta.latency_ms}MS</span>
          <span>${(result._meta.cost_usd * 100).toFixed(3)}¢</span>
        </div>
      </div>

      {hasError && (
        <div className="m-6 p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-[11px] font-bold text-red-400">
          {result._meta.error}
        </div>
      )}

      {!hasError && (
        <div className="p-4 space-y-1">
          {FIELDS.map(({ key, label: fieldLabel, icon: Icon }) => {
            const val = fmt(result[key as keyof CardResult]);
            const otherVal = fmt(other[key as keyof CardResult]);
            const differs = val !== otherVal && val !== '—' && otherVal !== '—';

            return (
              <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${differs ? 'bg-white/[0.03]' : ''}`}>
                <div className="flex items-center gap-2 shrink-0">
                  <Icon size={10} className="text-white/20" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{fieldLabel}</span>
                </div>
                <span
                  className={`text-[11px] text-right font-bold truncate ml-4 ${differs ? '' : 'text-white/60'}`}
                  style={{ color: differs ? color : undefined }}
                >
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {!hasError && !winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 pt-0">
            <button
              onClick={onScore}
              className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-110 active:scale-95"
              style={{ background: color, color: '#09090B' }}
            >
              ÉLIRE {label}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isWinner && (
        <div className="m-4 px-4 py-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center gap-2" style={{ color }}>
          <CheckCircle2 size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest">Gagnant séléctionné</span>
        </div>
      )}
    </motion.div>
  );
}

function StatsBar({ stats }: { stats: StatsResponse }) {
  if (!stats.total_scored || !stats.wins) return null;
  const total = stats.total_scored;
  const haikuPct = Math.round((stats.wins.haiku / total) * 100);
  const geminiPct = Math.round((stats.wins.gemini / total) * 100);

  return (
    <div className="panel p-8 rounded-[40px] border border-white/10 bg-white/[0.02] space-y-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Scale size={120} />
      </div>

      <div className="flex items-center justify-between relative z-10">
        <div>
          <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Benchmarking Global</h3>
          <p className="text-2xl font-black text-white tracking-tighter">{total} TESTS EFFECTUÉS</p>
        </div>
        <div className="flex gap-4">
          {stats.avg_cost_usd && (
            <div className="text-right">
              <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">COÛT MOYEN</div>
              <div className="text-sm font-black text-white">
                <span className="text-[#F5AF23]">${(stats.avg_cost_usd.haiku! * 100).toFixed(2)}¢</span>
                <span className="mx-2 text-white/10">/</span>
                <span className="text-[#4285F4]">${(stats.avg_cost_usd.gemini! * 100).toFixed(2)}¢</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 relative z-10">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#F5AF23]">HAIKU {haikuPct}%</span>
            <div className="text-xs font-black text-white">{stats.wins.haiku} Victoires</div>
          </div>
          <div className="text-right space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#4285F4]">GEMINI {geminiPct}%</span>
            <div className="text-xs font-black text-white">{stats.wins.gemini} Victoires</div>
          </div>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-white/5 flex gap-0.5 p-[1px]">
          <motion.div initial={{ width: 0 }} animate={{ width: `${haikuPct}%` }} className="h-full rounded-l-full" style={{ background: '#F5AF23' }} />
          <motion.div initial={{ width: 0 }} animate={{ width: `${geminiPct}%` }} className="h-full rounded-r-full" style={{ background: '#4285F4' }} />
        </div>
        <div className="flex justify-center gap-8 pt-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{stats.wins.tie} Égalités</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500/40" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{stats.wins.both_wrong} Erreurs</span>
          </div>
        </div>
      </div>
    </div>
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
    } catch { }
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
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveView('dashboard')}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-white transition-all active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Arena Compare</h2>
              <p className="text-sm text-[var(--text-muted)] font-medium">Comparaison en temps réel Haiku vs Gemini Flash</p>
            </div>
          </div>
          <div className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <Zap size={14} className="text-yellow-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Live Benchmarking</span>
          </div>
        </div>

        {stats && <StatsBar stats={stats} />}

        <div className="grid lg:grid-cols-[1fr_400px] gap-8 mt-10">
          <div className="space-y-6">
            <div className="panel p-6 rounded-[32px] bg-white/[0.01] border border-white/5">
              <div className="flex gap-4 aspect-[4/3]">
                <ImageDropzone label="RECTO" file={frontFile} onChange={setFrontFile} />
                <ImageDropzone label="VERSO" file={backFile} onChange={setBackFile} />
              </div>
            </div>

            <button
              onClick={handleCompare}
              disabled={!canCompare || loading}
              className={`w-full py-5 rounded-[24px] text-xs font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl ${!canCompare || loading
                ? 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed'
                : 'bg-[var(--accent)] border border-[var(--border-accent)] text-[#09090B] shadow-[var(--accent-glow)] hover:brightness-110 active:scale-95'
                }`}
            >
              {loading ? <RefreshCw size={20} className="animate-spin" /> : <Zap size={20} />}
              {loading ? 'DYSSECTION EN COURS…' : 'LANCER L’ÉVALUATION IA'}
            </button>

            {error && (
              <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-xs font-bold text-red-400 flex items-center gap-3">
                <XCircle size={16} />
                {error}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {!result && (
              <div className="panel p-8 rounded-[40px] bg-black/40 border border-white/5 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/10">
                  <Scan size={32} />
                </div>
                <h3 className="text-sm font-black text-white/40 uppercase tracking-widest">En attente de données</h3>
                <p className="text-xs font-medium text-white/20 leading-relaxed max-w-[200px]">
                  Chargez les photos d'une carte pour comparer les performances d'extraction
                </p>
              </div>
            )}

            {result && (
              <div className="grid grid-cols-1 gap-6">
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
            )}

            {result && !winner && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleScore('tie')}
                  disabled={scoring}
                  className="py-3 rounded-2xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white transition-all"
                >
                  Égalité
                </button>
                <button
                  onClick={() => handleScore('both_wrong')}
                  disabled={scoring}
                  className="py-3 rounded-2xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white transition-all"
                >
                  Les deux faux
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
