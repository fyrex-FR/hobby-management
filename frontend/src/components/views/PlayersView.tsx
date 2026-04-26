import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  ChevronRight,
  Search,
  Star,
  Euro,
  Hash,
  Layers,
  X,
  User as UserIcon,
  Library,
  RefreshCw
} from 'lucide-react';
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
  base: '#52525B',
  insert: '#6366f1',
  parallel: '#8b5cf6',
  numbered: 'var(--accent)',
  auto: '#10b981',
  patch: '#ef4444',
  auto_patch: '#f59e0b',
};

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: any; accent?: boolean }) {
  return (
    <div className="panel p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center">
      <div className={`p-1.5 rounded-lg mb-2 ${accent ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'bg-white/5 text-[var(--text-muted)]'}`}>
        <Icon size={14} />
      </div>
      <div className={`text-lg font-black tracking-tight ${accent ? 'text-[var(--accent)]' : 'text-white'}`}>{value}</div>
      <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-0.5">{label}</div>
    </div>
  );
}

function PlayerRow({ stats, onClick }: { stats: PlayerStats; onClick: () => void }) {

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="w-full panel p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all flex items-center gap-5 group active:scale-[0.99]"
    >
      <div className="w-16 h-20 rounded-2xl bg-white/5 border border-white/5 overflow-hidden shrink-0 relative">
        {stats.topCard?.image_front_url ? (
          <img src={stats.topCard.image_front_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20"><UserIcon size={24} /></div>
        )}
      </div>

      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-base font-black text-white tracking-tight truncate">{stats.player}</h3>
          <div className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[10px] font-black text-white/40 uppercase tracking-widest">
            {stats.total} Card{stats.total > 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {stats.autos > 0 && (
            <div className="px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] font-black uppercase tracking-widest">
              {stats.autos} Auto
            </div>
          )}
          {stats.numbered > 0 && (
            <div className="px-1.5 py-0.5 rounded bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest">
              {stats.numbered} #
            </div>
          )}
        </div>

        <div className="flex h-1 rounded-full overflow-hidden bg-white/5 gap-0.5">
          {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <div
              key={type}
              className="h-full"
              style={{ width: `${(count / stats.total) * 100}%`, background: TYPE_COLORS[type] || '#52525B' }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 shrink-0">
        <div className="text-right">
          <div className={`text-xl font-black tracking-tighter ${stats.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.totalSaleEstimate.toFixed(0)}€
          </div>
          <div className="text-[9px] font-black text-white/20 uppercase tracking-widest">Valeur Estimée</div>
        </div>
        <ChevronRight size={20} className="text-white/10 group-hover:text-white/40 group-hover:translate-x-1 transition-all" />
      </div>
    </motion.button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="panel w-full max-w-2xl rounded-[40px] overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] border border-[var(--border-accent)] flex items-center justify-center text-[var(--accent)]">
                <UserIcon size={24} />
              </div>
              <h3 className="text-2xl font-black text-white">{stats.player}</h3>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white/40 hover:text-white"><X size={24} /></button>
          </div>
          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={openInCollection}
              className="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
            >
              Voir la Collection <Library size={12} />
            </button>
            <div className="px-3 py-1 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest">
              {stats.total} Cartes
            </div>
          </div>
        </div>

        <div className="p-8 overflow-y-auto flex-1 space-y-10">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Autos" value={stats.autos} icon={Star} />
            <StatCard label="Memorabilia" value={stats.patches} icon={Layers} />
            <StatCard label="Numérotés" value={stats.numbered} icon={Hash} />
            <StatCard label="Estimation" value={`${stats.totalSaleEstimate.toFixed(0)}€`} icon={Euro} accent />
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-2">Toute la collection</h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {stats.cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-white/5 border border-white/5 hover:border-white/20 transition-all"
                >
                  {card.image_front_url ? (
                    <img src={card.image_front_url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10"><Library size={24} /></div>
                  )}
                  {card.numbered && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-black text-[var(--accent)]">
                      {card.numbered}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-[10px] font-black text-white truncate uppercase">{card.set_name}</p>
                    <p className="text-[9px] font-medium text-white/60">{card.year}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {selectedCard && <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />}
      </AnimatePresence>
    </div>
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
        <RefreshCw size={40} className="text-[var(--accent)] animate-spin opacity-20" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Player Index</h2>
            <p className="text-sm text-[var(--text-muted)] font-medium">Analyse détaillée par athlète</p>
          </div>
          <div className="flex gap-4">
            <div className="panel px-5 py-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center">
              <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Athlètes</div>
              <div className="text-lg font-black text-white tracking-tighter">{totals.players}</div>
            </div>
            <div className="panel px-5 py-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center">
              <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Valeur Totale</div>
              <div className="text-lg font-black text-[var(--accent)] tracking-tighter">{totals.value.toFixed(0)}€</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              type="text"
              placeholder="Rechercher un athlète…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl pl-12 pr-4 py-3 bg-white/5 border border-white/10 text-sm font-medium outline-none focus:bg-white/10 focus:border-[var(--accent)]/30 transition-all placeholder:text-white/20"
            />
          </div>
          <div className="flex p-1 rounded-2xl bg-white/5 border border-white/10">
            {([['count', 'Volume'], ['value', 'Valeur'], ['autos', 'Autos']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === key ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="panel p-20 rounded-[40px] bg-white/[0.02] border border-white/5 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-[24px] bg-white/5 border border-white/10 flex items-center justify-center text-white/20 mb-6">
              <Users size={32} />
            </div>
            <h3 className="text-xl font-black text-white">Aucun résultat</h3>
            <p className="text-sm text-[var(--text-muted)] mt-2">Ajustez votre recherche pour trouver un athlète.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((stats) => (
                <PlayerRow key={stats.player} stats={stats} onClick={() => setSelectedPlayer(stats)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedPlayer && (
          <PlayerModal stats={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

