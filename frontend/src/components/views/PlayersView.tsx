import { useMemo, useState } from 'react';
import { useCards } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card } from '../../types';
import { CardDetail } from '../shared/CardDetail';

interface PlayerStats {
  player: string;
  cards: Card[];
  total: number;
  byType: Record<string, number>;
  totalPurchase: number;
  totalSaleEstimate: number;
  profit: number;
  numbered: number;
  autos: number;
  patches: number;
  topCard: Card | null;
}

function buildStats(cards: Card[]): PlayerStats[] {
  const map = new Map<string, Card[]>();
  cards.forEach((c) => {
    if (c.status === 'draft') return;
    const key = c.player ?? 'Inconnu';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  });

  return Array.from(map.entries())
    .map(([player, playerCards]): PlayerStats => {
      const byType: Record<string, number> = {};
      let totalPurchase = 0;
      let totalSaleEstimate = 0;
      let numbered = 0;
      let autos = 0;
      let patches = 0;

      playerCards.forEach((c) => {
        const t = c.card_type ?? 'base';
        byType[t] = (byType[t] ?? 0) + 1;
        if (c.purchase_price != null) totalPurchase += c.purchase_price;
        if (c.price != null) totalSaleEstimate += c.price;
        if (c.numbered) numbered++;
        if (c.card_type === 'auto' || c.card_type === 'auto_patch') autos++;
        if (c.card_type === 'patch' || c.card_type === 'auto_patch') patches++;
      });

      const topCard = playerCards
        .filter((c) => c.price != null)
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0] ?? playerCards[0] ?? null;

      return {
        player,
        cards: playerCards,
        total: playerCards.length,
        byType,
        totalPurchase,
        totalSaleEstimate,
        profit: totalSaleEstimate - totalPurchase,
        numbered,
        autos,
        patches,
        topCard,
      };
    })
    .sort((a, b) => b.total - a.total);
}

const TYPE_COLORS: Record<string, string> = {
  base: 'var(--text-muted)',
  insert: '#6366f1',
  parallel: '#8b5cf6',
  numbered: 'var(--accent)',
  auto: 'rgb(16,185,129)',
  patch: 'rgb(239,68,68)',
  auto_patch: 'rgb(245,115,35)',
};
const TYPE_LABELS: Record<string, string> = {
  base: 'Base', insert: 'Insert', parallel: 'Parallel', numbered: 'Numbered',
  auto: 'Auto', patch: 'Patch', auto_patch: 'Auto/Patch',
};

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
      <span className="text-base font-bold" style={{ color: color ?? 'var(--text-primary)' }}>{value}</span>
      <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function PlayerCard({ stats, onClick }: { stats: PlayerStats; onClick: () => void }) {
  const maxType = Object.entries(stats.byType).sort((a, b) => b[1] - a[1])[0];

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl p-4 text-left transition-all hover:scale-[1.01]"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar / top card image */}
        <div className="shrink-0">
          {stats.topCard?.image_front_url ? (
            <img src={stats.topCard.image_front_url} alt="" className="h-16 w-auto rounded-lg object-contain" />
          ) : (
            <div className="h-16 w-12 rounded-lg flex items-center justify-center text-xl" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{stats.player}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold shrink-0"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
              {stats.total} carte{stats.total !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Stats pills */}
          <div className="flex flex-wrap gap-2 mb-3">
            {stats.autos > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(16,185,129,0.12)', color: 'rgb(16,185,129)', border: '1px solid rgba(16,185,129,0.2)' }}>
                {stats.autos} AUTO{stats.autos > 1 ? 'S' : ''}
              </span>
            )}
            {stats.patches > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(239,68,68,0.12)', color: 'rgb(239,68,68)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {stats.patches} PATCH{stats.patches > 1 ? 'ES' : ''}
              </span>
            )}
            {stats.numbered > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(245,166,35,0.12)', color: 'var(--accent)', border: '1px solid rgba(245,166,35,0.2)' }}>
                {stats.numbered} NUMÉROTÉE{stats.numbered > 1 ? 'S' : ''}
              </span>
            )}
          </div>

          {/* Type breakdown bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-3" style={{ background: 'var(--bg-elevated)' }}>
            {Object.entries(stats.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div
                  key={type}
                  style={{
                    width: `${(count / stats.total) * 100}%`,
                    background: TYPE_COLORS[type] ?? 'var(--text-muted)',
                  }}
                  title={`${TYPE_LABELS[type] ?? type}: ${count}`}
                />
              ))}
          </div>

          {/* Financials */}
          <div className="flex gap-3 text-xs">
            {stats.totalPurchase > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>
                Achat : <span style={{ color: 'var(--text-secondary)' }}>{stats.totalPurchase.toFixed(0)} €</span>
              </span>
            )}
            {stats.totalSaleEstimate > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>
                Valeur : <span style={{ color: stats.profit >= 0 ? 'rgb(16,185,129)' : 'var(--red)' }}>{stats.totalSaleEstimate.toFixed(0)} €</span>
              </span>
            )}
            {stats.totalPurchase > 0 && stats.totalSaleEstimate > 0 && (
              <span style={{ color: stats.profit >= 0 ? 'rgb(16,185,129)' : 'var(--red)' }}>
                {stats.profit >= 0 ? '+' : ''}{stats.profit.toFixed(0)} €
              </span>
            )}
            {maxType && (
              <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                Majorité <span style={{ color: TYPE_COLORS[maxType[0]] ?? 'var(--text-primary)' }}>{TYPE_LABELS[maxType[0]] ?? maxType[0]}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function PlayerModal({ stats, onClose }: { stats: PlayerStats; onClose: () => void }) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setDrillFilter = useAppStore((s) => s.setDrillFilter);

  function openInCollection() {
    setDrillFilter({ player: stats.player });
    setActiveView('collection');
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{stats.player}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stats.total} carte{stats.total !== 1 ? 's' : ''} dans la collection</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openInCollection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Voir dans la collection →
              </button>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>
          </div>

          {/* Stats summary */}
          <div className="px-5 py-4 border-b shrink-0 grid grid-cols-4 gap-3" style={{ borderColor: 'var(--border)' }}>
            <StatPill label="Cartes" value={stats.total} />
            <StatPill label="Autos" value={stats.autos} color="rgb(16,185,129)" />
            <StatPill label="Numérotées" value={stats.numbered} color="var(--accent)" />
            <StatPill label="Valeur" value={stats.totalSaleEstimate > 0 ? `${stats.totalSaleEstimate.toFixed(0)} €` : '—'} color="var(--text-primary)" />
          </div>

          {/* Type breakdown */}
          <div className="px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <span key={type} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'var(--bg-elevated)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[type] ?? 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{TYPE_LABELS[type] ?? type}</span>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{count}</span>
                  </span>
                ))}
            </div>
          </div>

          {/* Card list */}
          <div className="overflow-y-auto flex-1 p-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
            {stats.cards.map((card) => (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="rounded-xl overflow-hidden text-left transition-all hover:scale-[1.03] hover:border-[var(--accent)]/60"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <div className="aspect-[3/4] relative overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                  {card.image_front_url ? (
                    <img src={card.image_front_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🃏</div>
                  )}
                  {card.numbered && (
                    <div className="absolute top-1 right-1 text-[9px] font-black px-1 rounded"
                      style={{ background: 'rgba(245,166,35,0.9)', color: '#000' }}>
                      {card.numbered}
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{card.year} · {card.set_name}</p>
                  {card.price != null && (
                    <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{card.price} €</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      {selectedCard && <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </>
  );
}

export function PlayersView() {
  const { data: cards = [], isLoading } = useCards();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'count' | 'value' | 'autos'>('count');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerStats | null>(null);

  const allStats = useMemo(() => buildStats(cards), [cards]);

  const filtered = useMemo(() => {
    let list = allStats;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.player.toLowerCase().includes(q));
    }
    if (sortBy === 'value') list = [...list].sort((a, b) => b.totalSaleEstimate - a.totalSaleEstimate);
    else if (sortBy === 'autos') list = [...list].sort((a, b) => b.autos - a.autos);
    return list;
  }, [allStats, search, sortBy]);

  // Totaux globaux
  const totals = useMemo(() => ({
    cards: allStats.reduce((s, p) => s + p.total, 0),
    players: allStats.length,
    purchase: allStats.reduce((s, p) => s + p.totalPurchase, 0),
    value: allStats.reduce((s, p) => s + p.totalSaleEstimate, 0),
    autos: allStats.reduce((s, p) => s + p.autos, 0),
    numbered: allStats.reduce((s, p) => s + p.numbered, 0),
  }), [allStats]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Header */}
        <h2 className="font-bold text-xl mb-6" style={{ color: 'var(--text-primary)' }}>Stats par joueur</h2>

        {/* Global summary */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          <StatPill label="Joueurs" value={totals.players} />
          <StatPill label="Cartes" value={totals.cards} />
          <StatPill label="Autos" value={totals.autos} color="rgb(16,185,129)" />
          <StatPill label="Numérotées" value={totals.numbered} color="var(--accent)" />
          <StatPill label="Investi" value={totals.purchase > 0 ? `${totals.purchase.toFixed(0)} €` : '—'} />
          <StatPill
            label="Valeur estimée"
            value={totals.value > 0 ? `${totals.value.toFixed(0)} €` : '—'}
            color={totals.value >= totals.purchase ? 'rgb(16,185,129)' : 'var(--red)'}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <input
              type="text"
              placeholder="Rechercher un joueur…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl pl-7 pr-3 py-1.5 text-xs outline-none"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--text-muted)' }}>🔍</span>
          </div>
          <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            {([['count', 'Nb cartes'], ['value', 'Valeur'], ['autos', 'Autos']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className="px-3 py-1.5 text-xs transition-all"
                style={sortBy === key
                  ? { background: 'var(--accent)', color: '#0E0E11', fontWeight: 600 }
                  : { color: 'var(--text-secondary)' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Player list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <span className="text-4xl">🏀</span>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucun joueur trouvé.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((stats) => (
              <PlayerCard key={stats.player} stats={stats} onClick={() => setSelectedPlayer(stats)} />
            ))}
          </div>
        )}
      </div>

      {selectedPlayer && (
        <PlayerModal stats={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
    </div>
  );
}
