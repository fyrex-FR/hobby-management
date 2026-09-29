import { useMemo, useState } from 'react';
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
  ChevronRight,
  SearchX,
} from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card } from '../../types';
import { CardDetail } from '../shared/CardDetail';
import { cdnImg } from '../../lib/cdn';
import { buildPlayerCanonical, playerNameKey } from '../../lib/playerName';
import { Badge, EmptyState, Modal, Page, PageHeader, Spinner, StatTile } from '../ui';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

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
  // Fusionne les variantes accentuées/non accentuées (Jokić = Jokic).
  const canonical = buildPlayerCanonical(cards.filter((c) => c.status !== 'draft').map((c) => c.player));
  const map = new Map<string, Card[]>();
  cards.forEach((c) => {
    if (c.status === 'draft') return;
    const key = c.player ? (canonical.get(playerNameKey(c.player)) ?? c.player) : 'Inconnu';
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

/** Tirage affiché « /25 » quelle que soit la saisie (« 25 » ou « /25 »). */
function printRun(n: string): string {
  return n.includes('/') ? n : `/${n}`;
}

function Thumb({ card, className = 'h-12 w-9' }: { card: Card | null; className?: string }) {
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]`}>
      {card?.image_front_url ? (
        <img src={cdnImg(card.image_front_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]"><UserIcon size={16} /></div>
      )}
    </div>
  );
}

function PlayerRow({ stats, onClick }: { stats: PlayerStats; onClick: () => void }) {
  const mobileMeta = [
    stats.autos > 0 ? `${stats.autos} auto${stats.autos > 1 ? 's' : ''}` : null,
    stats.numbered > 0 ? `${stats.numbered} num.` : null,
  ].filter(Boolean);

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-elevated)] sm:px-4"
    >
      <Thumb card={stats.topCard} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{stats.player}</p>
        <p className="tabular mt-0.5 truncate text-xs text-[var(--text-muted)]">
          {stats.total} carte{stats.total > 1 ? 's' : ''}
          <span className="sm:hidden">{mobileMeta.length > 0 && ` · ${mobileMeta.join(' · ')}`}</span>
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {stats.autos > 0 && <Badge tone="green"><Star size={11} />{stats.autos} auto{stats.autos > 1 ? 's' : ''}</Badge>}
        {stats.patches > 0 && <Badge tone="red"><Layers size={11} />{stats.patches} patch{stats.patches > 1 ? 's' : ''}</Badge>}
        {stats.numbered > 0 && <Badge tone="accent"><Hash size={11} />{stats.numbered} num.</Badge>}
      </div>

      <span className={`tabular w-16 shrink-0 text-right text-[13px] font-medium sm:w-20 ${stats.totalSaleEstimate > 0 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
        {stats.totalSaleEstimate > 0 ? euro.format(stats.totalSaleEstimate) : '—'}
      </span>

      <ChevronRight size={16} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
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
      <Modal
        onClose={onClose}
        // Sous CardDetail (z-50) qui s'ouvre par-dessus, au-dessus de la barre d'onglets (z-40).
        zIndex={45}
        dismissible={!selectedCard}
        size="lg"
        title={stats.player}
        subtitle={<span className="tabular">{stats.total} carte{stats.total > 1 ? 's' : ''} dans la collection</span>}
        icon={
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-dim)] text-[var(--accent)]">
            <UserIcon size={18} />
          </div>
        }
        footer={
          <>
            <button onClick={onClose} className="ui-btn">Fermer</button>
            <button onClick={openInCollection} className="ui-btn ui-btn-primary">
              <Library size={15} />
              Voir dans la collection
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Autos" value={stats.autos} icon={Star} />
            <StatTile label="Patchs" value={stats.patches} icon={Layers} />
            <StatTile label="Numérotées" value={stats.numbered} icon={Hash} />
            <StatTile
              label="Estimation"
              value={stats.totalSaleEstimate > 0 ? euro.format(stats.totalSaleEstimate) : '—'}
              hint={stats.totalPurchase > 0 ? `Achat ${euro.format(stats.totalPurchase)}` : undefined}
              icon={Euro}
              accent={stats.totalSaleEstimate > 0}
            />
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Cartes</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {stats.cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  title={[card.year, card.set_name, card.parallel_name !== 'Base' ? card.parallel_name : null].filter(Boolean).join(' · ')}
                >
                  {card.image_front_url ? (
                    <img src={cdnImg(card.image_front_url)} alt={card.player ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]"><Library size={18} /></div>
                  )}
                  {card.numbered && (
                    <span className="tabular absolute right-1 top-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                      {printRun(card.numbered)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      </Modal>
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

  const totals = useMemo(() => ({
    players: allStats.length,
    cards: allStats.reduce((s, p) => s + p.total, 0),
  }), [allStats]);

  if (isLoading) {
    return (
      <Page>
        <PageHeader title="Joueurs" />
        <Spinner label="Chargement…" className="py-24" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Joueurs"
        subtitle={<span className="tabular">{totals.players} joueurs · {totals.cards} cartes</span>}
      />

      {allStats.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            icon={Users}
            title="Aucun joueur pour l'instant"
            description="Les joueurs apparaissent ici dès que tu ajoutes des cartes à ta collection."
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                placeholder="Rechercher un joueur…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ui-input pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
                aria-label="Rechercher un joueur"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label="Effacer la recherche"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Trier par</span>
              <div className="ui-segmented" role="tablist" aria-label="Trier par">
                {([['count', 'Cartes'], ['value', 'Valeur'], ['autos', 'Autos']] as const).map(([key, label]) => (
                  <button key={key} role="tab" aria-selected={sortBy === key} data-active={sortBy === key} onClick={() => setSortBy(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="ui-card">
              <EmptyState
                icon={SearchX}
                title="Aucun joueur ne correspond"
                description={`Aucun résultat pour « ${search} ».`}
                action={<button onClick={() => setSearch('')} className="ui-btn"><X size={14} /> Effacer la recherche</button>}
              />
            </div>
          ) : (
            <div className="ui-card divide-y divide-[var(--border)] overflow-hidden">
              {filtered.map((stats) => (
                <PlayerRow key={stats.player} stats={stats} onClick={() => setSelectedPlayer(stats)} />
              ))}
            </div>
          )}
        </>
      )}

      {selectedPlayer && (
        <PlayerModal stats={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
    </Page>
  );
}
