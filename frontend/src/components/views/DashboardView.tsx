import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  Tag,
  Hash,
  PenTool,
  Euro,
  Clock,
  Star,
  ChevronRight
} from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card } from '../../types';
import { GradingBadge } from '../shared/GradingBadge';
import { RookieBadge } from '../shared/RookieBadge';

/* ── tiny helpers ─────────────────────────────────────────── */

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0 flex items-center justify-center transition-all"
      style={
        accent
          ? { background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }
          : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
      }
    >
      {children}
    </span>
  );
}

/* ── KPI strip ────────────────────────────────────────────── */

function KpiStrip({ stats }: { stats: ReturnType<typeof buildStats> }) {
  const kpis = [
    { label: 'TOTAL', value: stats.total, icon: Trophy, accent: false },
    { label: 'À VENDRE', value: stats.aVendre, icon: Tag, accent: stats.aVendre > 0 },
    { label: 'NUMBERED', value: stats.numbered, icon: Hash, accent: stats.numbered > 0 },
    { label: 'AUTOS', value: stats.autos, icon: PenTool, accent: stats.autos > 0 },
    { label: 'VALEUR', value: stats.totalValue > 0 ? `${stats.totalValue}€` : '—', icon: Euro, accent: false },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {kpis.map(({ label, value, icon: Icon, accent }, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="glass rounded-2xl p-4 flex flex-col items-start gap-3 group relative overflow-hidden"
        >
          <div className={`p-2 rounded-xl transition-colors ${accent ? 'bg-[var(--accent-glow)]' : 'bg-white/5'}`}>
            <Icon size={18} className={accent ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
              {label}
            </span>
            <span
              className="text-2xl font-black tabular-nums tracking-tight mt-0.5"
              style={{
                color: accent ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              {value}
            </span>
          </div>
          {accent && (
            <div className="absolute top-0 right-0 w-12 h-12 bg-[var(--accent)] opacity-[0.03] blur-2xl rounded-full" />
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ── Status bar ───────────────────────────────────────────── */

function StatusBar({ cards }: { cards: Card[] }) {
  const total = cards.length;
  if (total === 0) return null;

  const segments = [
    { key: 'collection', color: '#71717A', label: 'Collection', count: cards.filter((c) => c.status === 'collection').length },
    { key: 'a_vendre', color: 'var(--accent)', label: 'À vendre', count: cards.filter((c) => c.status === 'a_vendre').length },
    { key: 'reserve', color: '#3B82F6', label: 'Réservé', count: cards.filter((c) => c.status === 'reserve').length },
    { key: 'vendu', color: '#10B981', label: 'Vendu', count: cards.filter((c) => c.status === 'vendu').length },
  ].filter((s) => s.count > 0);

  return (
    <div className="glass rounded-3xl p-6 border-strong relative overflow-hidden">
      <div className="flex items-center justify-between mb-5 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 rounded-full bg-[var(--accent)]" />
          <h3 className="text-sm font-bold tracking-tight text-white">Répartition du stock</h3>
        </div>
        <span className="text-xs font-medium text-[var(--text-secondary)] bg-white/5 px-2.5 py-1 rounded-full">
          {total} cartes au total
        </span>
      </div>

      <div className="flex rounded-full overflow-hidden h-2.5 mb-6 gap-0.5 bg-white/5 p-0.5">
        {segments.map((s) => (
          <motion.div
            key={s.key}
            initial={{ width: 0 }}
            animate={{ width: `${(s.count / total) * 100}%` }}
            transition={{ duration: 0.8, ease: "circOut" }}
            style={{ background: s.color }}
            className="h-full rounded-full"
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3 relative z-10">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2 group transition-opacity hover:opacity-100 opacity-80">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
            <span className="text-xs font-medium text-[var(--text-secondary)]">{s.label}</span>
            <span className="text-xs font-bold text-white ml-0.5">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top list ─────────────────────────────────────────────── */

function TopList({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: { label: string; count: number; img?: string | null }[];
  onSelect: (label: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="glass rounded-3xl overflow-hidden flex flex-col border-strong">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-muted)] flex items-center gap-2">
          <Star size={12} className="text-[var(--accent)]" />
          {title}
        </h3>
      </div>
      <div className="flex flex-col p-1.5">
        {items.slice(0, 5).map(({ label, count }, i) => (
          <button
            key={label}
            onClick={() => onSelect(label)}
            className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left rounded-2xl transition-all hover:bg-white/5 group relative"
          >
            <span
              className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${i === 0 ? 'bg-[var(--accent)] text-black' : 'bg-white/5 text-[var(--text-muted)]'
                }`}
            >
              {i + 1}
            </span>
            <span className="flex-1 text-sm font-semibold truncate text-[var(--text-primary)] group-hover:text-white">
              {label}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-white/5 text-[var(--text-secondary)] group-hover:text-[var(--accent)] group-hover:bg-[var(--accent-glow)] transition-colors">
              {count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Card row (rare / recent) ─────────────────────────────── */

function CardRow({ card, onClick }: { card: Card; onClick: () => void }) {
  const sub = [card.brand, card.set_name, card.parallel_name !== 'Base' ? card.parallel_name : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-3 text-left rounded-2xl transition-all hover:bg-white/5 group relative"
    >
      <div className="relative shrink-0">
        {card.image_front_url ? (
          <img src={card.image_front_url} alt="" className="w-9 h-12 object-cover rounded-lg shadow-2xl transition-transform group-hover:scale-110 group-hover:-rotate-2" />
        ) : (
          <div className="w-9 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg bg-[var(--bg-elevated)] border border-white/5">
            🃏
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate text-[var(--text-primary)] group-hover:text-white transition-colors">
          {card.player ?? 'Sans joueur'}
        </p>
        <p className="text-[11px] font-medium truncate mt-0.5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">{sub}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {card.is_rookie && <RookieBadge compact />}
        {card.grading_company && <GradingBadge card={card} compact />}
        <div className="flex gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
          {card.numbered && <Pill accent>{card.numbered}</Pill>}
          {(card.card_type === 'auto' || card.card_type === 'auto_patch') && <Pill>AUTO</Pill>}
        </div>
        <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}

/* ── Panel wrapper ────────────────────────────────────────── */

function Panel({ title, badge, icon: Icon, children }: { title: string; badge?: number; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl overflow-hidden flex flex-col border-strong">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-white/5 text-[var(--text-secondary)]">
            <Icon size={14} />
          </div>
          <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--text-secondary)]">
            {title}
          </h3>
        </div>
        {badge !== undefined && badge > 0 && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--border-accent)]">
            {badge}
          </span>
        )}
      </div>
      <div className="p-2 flex flex-col gap-0.5">
        {children}
      </div>
    </div>
  );
}

/* ── data builder ─────────────────────────────────────────── */

function buildStats(cards: Card[]) {
  const active = cards.filter((c) => c.status !== 'draft');

  const rare = active
    .filter((c) => c.card_type === 'auto' || c.card_type === 'patch' || c.card_type === 'auto_patch' || !!c.numbered)
    .sort((a, b) => {
      const n = (s: string | null) => (s ? parseInt(s.replace('/', '')) : 9999);
      return n(a.numbered) - n(b.numbered);
    })
    .slice(0, 5);

  const recent = [...active]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  function topBy(key: keyof Card) {
    const map: Record<string, { count: number; img: string | null }> = {};
    active.forEach((c) => {
      const v = c[key] as string | null;
      if (!v) return;
      if (!map[v]) map[v] = { count: 0, img: c.image_front_url };
      map[v].count++;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, { count, img }]) => ({ label, count, img }));
  }

  const totalValue = active.reduce((sum, c) => sum + (c.price ?? 0), 0);

  return {
    total: active.length,
    aVendre: active.filter((c) => c.status === 'a_vendre').length,
    numbered: active.filter((c) => !!c.numbered).length,
    autos: active.filter((c) => c.card_type === 'auto' || c.card_type === 'auto_patch').length,
    totalValue: Math.round(totalValue),
    topPlayers: topBy('player'),
    topTeams: topBy('team'),
    topSets: topBy('set_name'),
    topYears: topBy('year'),
    rare,
    recent,
  };
}

/* ── main view ────────────────────────────────────────────── */

export function DashboardView() {
  const { data: cards = [], isLoading } = useCards();
  const { setActiveView, setDrillFilter } = useAppStore();

  const stats = useMemo(() => buildStats(cards), [cards]);

  function drillPlayer(player: string) { setDrillFilter({ player }); setActiveView('collection'); }
  function drillTeam(team: string) { setDrillFilter({ team }); setActiveView('collection'); }
  function drillSet(set: string) { setDrillFilter({ set_name: set }); setActiveView('collection'); }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-[var(--text-muted)]">Analyse des données…</span>
        </div>
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-6"
      >
        <div className="relative">
          <div className="w-24 h-24 rounded-[40px] flex items-center justify-center text-4xl glass border-strong shadow-2xl rotate-12">
            🏀
          </div>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-4 -right-4 w-12 h-12 rounded-2xl glass border-strong flex items-center justify-center text-xl shadow-xl -rotate-12"
          >
            💎
          </motion.div>
        </div>

        <div className="max-w-xs">
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Votre sanctuaire est prêt</h2>
          <p className="text-sm font-medium text-[var(--text-secondary)] leading-relaxed">
            Commencez à bâtir votre héritage en ajoutant vos premières pépites à la collection.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <button
            onClick={() => setActiveView('add_card')}
            className="px-8 py-3.5 rounded-2xl text-sm font-bold transition-all bg-[var(--accent)] text-black hover:scale-105 active:scale-95 shadow-xl shadow-[var(--accent-glow)]"
          >
            + Ajouter mon premier hit
          </button>
          <button
            onClick={() => setActiveView('batch')}
            className="px-8 py-3.5 rounded-2xl text-sm font-bold transition-all glass border-strong hover:bg-white/5 active:scale-95"
          >
            Import en lot (Bulk)
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top,_var(--accent-dim)_0%,_transparent_50%)]">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8 animate-in">

        {/* KPI strip */}
        <KpiStrip stats={stats} />

        {/* Status bar */}
        <StatusBar cards={cards.filter((c) => c.status !== 'draft')} />

        {/* Top lists */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TopList title="Légendes & Stars" items={stats.topPlayers} onSelect={drillPlayer} />
          <TopList title="Franchises" items={stats.topTeams} onSelect={drillTeam} />
          <TopList title="Collections (Sets)" items={stats.topSets} onSelect={drillSet} />
          <TopList title="Générations" items={stats.topYears} onSelect={(y) => { setDrillFilter({ year: y }); setActiveView('collection'); }} />
        </div>

        {/* Rare pieces + Recent additions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">
          {stats.rare.length > 0 && (
            <Panel title="Pépites & Raretés" badge={stats.rare.length} icon={Star}>
              {stats.rare.map((card) => (
                <CardRow key={card.id} card={card} onClick={() => setActiveView('collection')} />
              ))}
            </Panel>
          )}

          <Panel title="Dernières acquisitions" icon={Clock}>
            {stats.recent.map((card) => (
              <CardRow key={card.id} card={card} onClick={() => setActiveView('collection')} />
            ))}
          </Panel>
        </div>

      </div>
    </div>
  );
}
