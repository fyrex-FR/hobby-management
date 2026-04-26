import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Star,
  Euro,
  Hash,
  Layers,
  X,
  User as UserIcon,
  Library,
  RefreshCw,
  ChevronRight,
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

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: any; accent?: boolean }) {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center gap-1.5">
      <div className={`p-1.5 rounded-lg ${accent ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'bg-white/5 text-white/30'}`}>
        <Icon size={14} />
      </div>
      <div className={`text-xl font-black tracking-tight ${accent ? 'text-[var(--accent)]' : 'text-white'}`}>{value}</div>
      <div className="text-[9px] font-black uppercase tracking-widest text-white/25">{label}</div>
    </div>
  );
}

function PlayerRow({ stats, onClick }: { stats: PlayerStats; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="w-full p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all flex items-center gap-4 group active:scale-[0.99] text-left"
    >
      {/* Photo */}
      <div className="w-12 h-16 rounded-xl bg-white/5 border border-white/5 overflow-hidden shrink-0">
        {stats.topCard?.image_front_url ? (
          <img src={stats.topCard.image_front_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20"><UserIcon size={18} /></div>
        )}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-black text-white truncate block mb-2">{stats.player}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] font-bold text-white/50">
            <Library size={10} />
            {stats.total}
          </span>
          {stats.autos > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] font-black uppercase tracking-wider">
              <Star size={8} />{stats.autos} Auto
            </span>
          )}
          {stats.patches > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[9px] font-black uppercase tracking-wider">
              <Layers size={8} />{stats.patches} Mémo
            </span>
          )}
          {stats.numbered > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider">
              <Hash size={8} />{stats.numbered} #
            </span>
          )}
        </div>
      </div>

      {/* Nb cartes — mis en avant */}
      <div className="shrink-0 text-right">
        <div className="text-2xl font-black text-white tracking-tighter leading-none">{stats.total}</div>
        <div className="text-[9px] font-black text-white/25 uppercase tracking-widest mt-0.5">carte{stats.total > 1 ? 's' : ''}</div>
      </div>

      <ChevronRight size={16} className="text-white/10 group-hover:text-white/40 transition-colors shrink-0" />
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
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="panel w-full max-w-2xl rounded-[32px] overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent-dim)] border border-[var(--border-accent)] flex items-center justify-center text-[var(--accent)]">
                <UserIcon size={20} />
              </div>
              <div>
                <h3 className="text-xl font-black text-white leading-none">{stats.player}</h3>
                <p className="text-xs text-white/30 font-medium mt-0.5">{stats.total} cartes dans la collection</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-white/40 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          <button
            onClick={openInCollection}
            className="mt-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
          >
            <Library size={12} />
            Voir dans la collection
          </button>
        </div>

        {/* Stats */}
        <div className="px-6 py-5 border-b border-white/5 shrink-0">
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Autos" value={stats.autos} icon={Star} />
            <StatCard label="Memorabilia" value={stats.patches} icon={Layers} />
            <StatCard label="Numérotés" value={stats.numbered} icon={Hash} />
            <StatCard label="Estimation" value={`${stats.totalSaleEstimate.toFixed(0)}€`} icon={Euro} accent />
          </div>
        </div>

        {/* Cards grid */}
        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">Toute la collection</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
            {stats.cards.map((card) => (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-white/5 border border-white/5 hover:border-white/20 transition-all"
              >
                {card.image_front_url ? (
                  <img src={card.image_front_url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-10"><Library size={18} /></div>
                )}
                {card.numbered && (
                  <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[8px] font-black text-[var(--accent)]">
                    /{card.numbered}
                  </div>
                )}
              </button>
            ))}
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
    players: allStats.length,
    cards: allStats.reduce((s, p) => s + p.total, 0),
  }), [allStats]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={32} className="text-[var(--accent)] animate-spin opacity-20" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Joueurs</h2>
            <p className="text-sm text-white/30 font-medium mt-0.5">
              {totals.players} joueurs · {totals.cards} cartes
            </p>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              type="text"
              placeholder="Rechercher un joueur…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 text-sm font-medium outline-none focus:bg-white/8 focus:border-white/20 transition-all placeholder:text-white/20"
            />
          </div>
          <div className="flex p-1 rounded-xl bg-white/5 border border-white/10">
            {([['count', 'Cartes'], ['value', 'Valeur'], ['autos', 'Autos']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === key ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="p-16 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center text-center">
            <Users size={28} className="text-white/10 mb-4" />
            <h3 className="text-base font-black text-white">Aucun résultat</h3>
            <p className="text-sm text-white/30 mt-1">Modifiez votre recherche.</p>
          </div>
        ) : (
          <div className="space-y-2">
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
