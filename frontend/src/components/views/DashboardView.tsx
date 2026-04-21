import { useMemo } from 'react';
import { useCards } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card } from '../../types';
import { GradingBadge } from '../shared/GradingBadge';
import { RookieBadge } from '../shared/RookieBadge';

/* ── tiny helpers ─────────────────────────────────────────── */

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
      style={
        accent
          ? { background: 'rgba(245,166,35,0.15)', color: 'var(--accent)', border: '1px solid rgba(245,166,35,0.25)' }
          : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }
      }
    >
      {children}
    </span>
  );
}

/* ── KPI strip ────────────────────────────────────────────── */

function KpiStrip({ stats }: { stats: ReturnType<typeof buildStats> }) {
  const kpis = [
    { label: 'TOTAL', value: stats.total, accent: false },
    { label: 'À VENDRE', value: stats.aVendre, accent: stats.aVendre > 0 },
    { label: 'NUMBERED', value: stats.numbered, accent: stats.numbered > 0 },
    { label: 'AUTOS', value: stats.autos, accent: stats.autos > 0 },
    { label: 'VALEUR', value: stats.totalValue > 0 ? `${stats.totalValue}€` : '—', accent: false },
  ];

  return (
    <div className="grid grid-cols-5 gap-px rounded-2xl overflow-hidden" style={{ background: 'var(--border-strong)' }}>
      {kpis.map(({ label, value, accent }) => (
        <div
          key={label}
          className="flex flex-col items-center justify-center py-4 px-1 gap-1.5"
          style={{ background: 'var(--bg-card)' }}
        >
          <span className="text-[8px] font-bold tracking-[0.08em] text-center leading-tight whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
            {label}
          </span>
          <span
            className="text-[22px] sm:text-[28px] font-black tabular-nums leading-none whitespace-nowrap"
            style={{
              color: accent ? 'var(--accent)' : 'var(--text-primary)',
              textShadow: accent ? '0 0 20px rgba(245,175,35,0.3)' : 'none',
            }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Status bar ───────────────────────────────────────────── */

function StatusBar({ cards }: { cards: Card[] }) {
  const total = cards.length;
  if (total === 0) return null;

  const segments = [
    { key: 'collection', color: '#4A4440', label: 'Collection', count: cards.filter((c) => c.status === 'collection').length },
    { key: 'a_vendre', color: 'var(--accent)', label: 'À vendre', count: cards.filter((c) => c.status === 'a_vendre').length },
    { key: 'reserve', color: '#4A90D9', label: 'Réservé', count: cards.filter((c) => c.status === 'reserve').length },
    { key: 'vendu', color: '#3DBE7A', label: 'Vendu', count: cards.filter((c) => c.status === 'vendu').length },
  ].filter((s) => s.count > 0);

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
          Répartition
        </h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{total} cartes</span>
      </div>
      <div className="flex rounded-full overflow-hidden h-2 mb-4 gap-px">
        {segments.map((s) => (
          <div key={s.key} style={{ flex: s.count / total, background: s.color, minWidth: s.count > 0 ? 3 : 0 }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{s.count}</span>
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
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="px-3 pt-3 pb-2">
        <h3 className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
          {title}
        </h3>
      </div>
      <div>
        {items.slice(0, 5).map(({ label, count }, i) => (
          <button
            key={label}
            onClick={() => onSelect(label)}
            className="flex items-center gap-2 w-full px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <span
              className="w-3 text-[10px] font-black shrink-0 text-right"
              style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              {i + 1}
            </span>
            <span
              className="flex-1 text-sm font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {label}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{
                background: i === 0 ? 'rgba(245,166,35,0.12)' : 'var(--bg-elevated)',
                color: i === 0 ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
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
      className="flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04] group"
    >
      {card.image_front_url ? (
        <img src={card.image_front_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
      ) : (
        <div className="w-7 h-9 rounded shrink-0 flex items-center justify-center text-sm" style={{ background: 'var(--bg-elevated)' }}>
          🃏
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate transition-colors group-hover:text-white" style={{ color: 'var(--text-primary)' }}>
          {card.player ?? '—'}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {card.is_rookie && <RookieBadge compact />}
        {card.grading_company && <GradingBadge card={card} compact />}
        {card.numbered && <Pill accent>{card.numbered}</Pill>}
        {(card.card_type === 'auto' || card.card_type === 'auto_patch') && <Pill>AUTO</Pill>}
        {(card.card_type === 'patch' || card.card_type === 'auto_patch') && <Pill>PATCH</Pill>}
      </div>
    </button>
  );
}

/* ── Panel wrapper ────────────────────────────────────────── */

function Panel({ title, badge, children }: { title: string; badge?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
          {title}
        </h3>
        {badge !== undefined && badge > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,166,35,0.15)', color: 'var(--accent)' }}>
            {badge}
          </span>
        )}
      </div>
      {children}
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
        <span style={{ color: 'var(--text-muted)' }} className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          🏀
        </div>
        <div>
          <p className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Collection vide</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Ajoute ta première carte ou importe en lot pour commencer
          </p>
        </div>
        <div className="flex gap-3 mt-1">
          <button
            onClick={() => setActiveView('batch')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            Import en lot
          </button>
          <button
            onClick={() => setActiveView('add_card')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#0d0c0b' }}
          >
            + Ajouter une carte
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        {/* KPI strip */}
        <KpiStrip stats={stats} />

        {/* Status bar */}
        <StatusBar cards={cards.filter((c) => c.status !== 'draft')} />

        {/* Top lists — 2 colonnes sur mobile, 4 sur desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TopList title="Top joueurs" items={stats.topPlayers} onSelect={drillPlayer} />
          <TopList title="Top équipes" items={stats.topTeams} onSelect={drillTeam} />
          <TopList title="Top sets" items={stats.topSets} onSelect={drillSet} />
          <TopList title="Top années" items={stats.topYears} onSelect={(y) => { setDrillFilter({ year: y }); setActiveView('collection'); }} />
        </div>

        {/* Rare pieces + Recent additions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {stats.rare.length > 0 && (
            <Panel title="Pièces rares" badge={stats.rare.length}>
              {stats.rare.map((card, i) => (
                <div key={card.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <CardRow card={card} onClick={() => setActiveView('collection')} />
                </div>
              ))}
            </Panel>
          )}

          <Panel title="Ajouts récents">
            {stats.recent.map((card, i) => (
              <div key={card.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <CardRow card={card} onClick={() => setActiveView('collection')} />
              </div>
            ))}
          </Panel>
        </div>

      </div>
    </div>
  );
}
