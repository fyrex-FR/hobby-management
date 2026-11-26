import { useMemo, useState } from 'react';
import {
  Trophy,
  Tag,
  Hash,
  PenTool,
  Euro,
  Clock,
  Star,
  ChevronRight,
  Users,
  Shield,
  Layers,
  CalendarDays,
  Library,
  Inbox,
  BadgeEuro,
  Send,
  FileClock,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import { useRequests } from '../../hooks/useRequests';
import { CardDetail } from '../shared/CardDetail';
import { displayPrice } from '../../lib/collectionFilters';
import { isOnline } from '../../lib/sales';
import { useAppStore } from '../../stores/appStore';
import type { Card } from '../../types';
import { cdnImg } from '../../lib/cdn';
import { estimatedValue } from '../../lib/collectionFilters';
import { GradingBadge } from '../shared/GradingBadge';
import { RookieBadge } from '../shared/RookieBadge';
import { Badge, EmptyState, Page, PageHeader, Panel, Spinner, StatTile } from '../ui';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('fr-FR');

/* ── KPI strip ────────────────────────────────────────────── */

function KpiStrip({ stats, onOpenCollection, onOpenSales }: { stats: ReturnType<typeof buildStats>; onOpenCollection: () => void; onOpenSales: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="col-span-2 lg:col-span-1 [&>*]:h-full">
        <StatTile
          label="Valeur estimée"
          value={stats.totalValue > 0 ? euro.format(stats.totalValue) : '—'}
          hint={stats.totalValue > 0 ? 'Vendues exclues' : 'Aucun prix renseigné'}
          icon={Euro}
          accent={stats.totalValue > 0}
        />
      </div>
      <div className="[&>*]:h-full">
        <StatTile label="Cartes" value={int.format(stats.total)} icon={Trophy} onClick={onOpenCollection} />
      </div>
      <div className="[&>*]:h-full">
        <StatTile label="À vendre" value={int.format(stats.aVendre)} icon={Tag} onClick={onOpenSales} />
      </div>
      <div className="[&>*]:h-full">
        <StatTile label="Numérotées" value={int.format(stats.numbered)} icon={Hash} />
      </div>
      <div className="[&>*]:h-full">
        <StatTile label="Autos" value={int.format(stats.autos)} icon={PenTool} />
      </div>
    </div>
  );
}

/* ── À faire ──────────────────────────────────────────────── */

type Todo = { key: string; count: number; label: string; hint: string; icon: LucideIcon; go: () => void };

/** Ce qui attend une action, en premier sur l'accueil ; chaque ligne mène à la bonne liste. */
function TodoStrip({ todos }: { todos: Todo[] }) {
  const pending = todos.filter((t) => t.count > 0);
  return (
    <section aria-labelledby="todo-title" className="space-y-2">
      <h2 id="todo-title" className="text-sm font-semibold text-[var(--text-primary)]">À faire</h2>
      {pending.length === 0 ? (
        <p className="ui-card flex items-center gap-2 px-4 py-3 text-[13px] text-[var(--text-secondary)]">
          <CheckCircle2 size={16} className="text-[var(--green)]" /> Rien en attente : demandes, prix et annonces sont à jour.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {pending.map((t) => (
            <button key={t.key} onClick={t.go} className="ui-card group flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]">
              <t.icon size={18} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
              <span className="tabular w-8 shrink-0 text-xl font-semibold tracking-tight text-[var(--text-primary)]">{t.count}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--text-primary)]">{t.label}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">{t.hint}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Top list ─────────────────────────────────────────────── */

function TopList({
  title,
  icon,
  items,
  onSelect,
}: {
  title: string;
  icon: LucideIcon;
  items: { label: string; count: number; img?: string | null }[];
  onSelect: (label: string) => void;
}) {
  const top = items.slice(0, 5);
  const max = top[0]?.count ?? 1;

  return (
    <Panel title={title} icon={icon} padded={false}>
      {top.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-[var(--text-muted)]">Pas encore de données</p>
      ) : (
        <ul className="p-1.5">
          {top.map(({ label, count }, i) => (
            <li key={label}>
              <button
                onClick={() => onSelect(label)}
                className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-elevated)]"
                title={`Voir les cartes : ${label}`}
              >
                <span className="tabular w-4 shrink-0 text-right text-xs text-[var(--text-muted)]">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)] group-hover:bg-[var(--bg-hover)]">
                    <span className="block h-full rounded-full bg-[var(--accent)] opacity-70" style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                </span>
                <span className="tabular shrink-0 text-xs text-[var(--text-secondary)] group-hover:text-[var(--accent)]">{count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Card row (rare / recent) ─────────────────────────────── */

function CardRow({ card, onClick }: { card: Card; onClick: () => void }) {
  const sub = [card.year, card.brand, card.set_name, card.parallel_name !== 'Base' ? card.parallel_name : null]
    .filter(Boolean)
    .join(' · ');
  const isAuto = card.card_type === 'auto' || card.card_type === 'auto_patch';

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-elevated)]"
    >
      {card.image_front_url ? (
        <img
          src={cdnImg(card.image_front_url)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-12 w-9 shrink-0 rounded-md border border-[var(--border)] object-cover"
        />
      ) : (
        <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <Library size={14} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{card.player ?? '—'}</p>
        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{sub || '—'}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden items-center gap-1.5 sm:flex lg:hidden xl:flex">
          {card.is_rookie && <RookieBadge compact />}
          {card.grading_company && <GradingBadge card={card} compact />}
          {isAuto && <Badge tone="green">Auto</Badge>}
        </span>
        {card.numbered && <Badge tone="accent" className="tabular">{card.numbered}</Badge>}
        {card.price != null && card.price > 0 && (
          <span className="tabular hidden w-16 text-right text-[13px] font-medium text-[var(--price)] sm:inline">{euro.format(card.price)}</span>
        )}
        <ChevronRight size={15} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
      </div>
    </button>
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

  const totalValue = estimatedValue(cards);

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
  const { data: requests = [] } = useRequests();
  const { setActiveView, setDrillFilter, openSales } = useAppStore();
  const [openCard, setOpenCard] = useState<Card | null>(null);

  const stats = useMemo(() => buildStats(cards), [cards]);
  const todos = useMemo<Todo[]>(() => {
    const forSale = cards.filter((c) => c.status === 'a_vendre');
    return [
      { key: 'requests', count: requests.filter((r) => r.status === 'new').length, label: 'Demandes à traiter', hint: 'Des visiteurs attendent une réponse', icon: Inbox, go: () => setActiveView('requests') },
      { key: 'reserve', count: cards.filter((c) => c.status === 'reserve').length, label: 'Réservées à conclure', hint: 'Encaisser ou remettre en vente', icon: Clock, go: () => openSales('reserve') },
      { key: 'pricer', count: forSale.filter((c) => displayPrice(c) == null).length, label: 'À pricer', hint: 'À vendre, mais sans prix', icon: BadgeEuro, go: () => openSales('pricer') },
      { key: 'publier', count: forSale.filter((c) => displayPrice(c) != null && !isOnline(c)).length, label: 'À publier', hint: 'Prix fixé, aucune annonce en ligne', icon: Send, go: () => openSales('publier') },
      { key: 'drafts', count: cards.filter((c) => c.status === 'draft').length, label: 'Brouillons à vérifier', hint: 'Cartes lues par l’IA, à valider', icon: FileClock, go: () => setActiveView('review') },
    ];
  }, [cards, requests, setActiveView, openSales]);
  const shownCard = openCard ? cards.find((c) => c.id === openCard.id) ?? openCard : null;

  function drillPlayer(player: string) { setDrillFilter({ player }); setActiveView('collection'); }
  function drillTeam(team: string) { setDrillFilter({ team }); setActiveView('collection'); }
  function drillSet(set: string) { setDrillFilter({ set_name: set }); setActiveView('collection'); }

  if (isLoading) {
    return (
      <Page>
        <PageHeader title="Vue d'ensemble" />
        <Spinner label="Chargement…" className="py-24" />
      </Page>
    );
  }

  if (stats.total === 0) {
    return (
      <Page>
        <PageHeader title="Vue d'ensemble" />
        <div className="ui-card">
          <EmptyState
            icon={Trophy}
            title="Ta collection est vide"
            description="Ajoute tes premières cartes une par une, ou importe tout un lot de photos d'un coup."
            action={
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <button onClick={() => setActiveView('add_card')} className="ui-btn ui-btn-primary">
                  Ajouter une carte
                </button>
                <button onClick={() => setActiveView('batch')} className="ui-btn">
                  Import en lot
                </button>
              </div>
            }
          />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Vue d'ensemble"
        subtitle={
          <span className="tabular">
            {int.format(stats.total)} cartes{stats.totalValue > 0 && <> · {euro.format(stats.totalValue)} estimés</>}
          </span>
        }
        actions={
          <button onClick={() => setActiveView('collection')} className="ui-btn">
            <Library size={15} />
            Ouvrir la collection
          </button>
        }
      />

      <TodoStrip todos={todos} />

      <KpiStrip stats={stats} onOpenCollection={() => setActiveView('collection')} onOpenSales={() => setActiveView('sales')} />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel title="Dernières acquisitions" icon={Clock} padded={false}>
          <div className="p-1.5">
            {stats.recent.map((card) => (
              <CardRow key={card.id} card={card} onClick={() => setOpenCard(card)} />
            ))}
          </div>
        </Panel>

        <Panel
          title="Raretés"
          icon={Star}
          padded={false}
          action={stats.rare.length > 0 ? <span className="text-xs text-[var(--text-muted)]">Autos, patchs, numérotées</span> : undefined}
        >
          {stats.rare.length > 0 ? (
            <div className="p-1.5">
              {stats.rare.map((card) => (
                <CardRow key={card.id} card={card} onClick={() => setOpenCard(card)} />
              ))}
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
              Aucune auto, patch ou carte numérotée pour l'instant.
            </p>
          )}
        </Panel>
      </div>
      {/* Top lists : un clic ouvre la collection filtrée */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <TopList title="Joueurs" icon={Users} items={stats.topPlayers} onSelect={drillPlayer} />
        <TopList title="Équipes" icon={Shield} items={stats.topTeams} onSelect={drillTeam} />
        <TopList title="Sets" icon={Layers} items={stats.topSets} onSelect={drillSet} />
        <TopList title="Années" icon={CalendarDays} items={stats.topYears} onSelect={(y) => { setDrillFilter({ year: y }); setActiveView('collection'); }} />
      </div>

      {shownCard && <CardDetail card={shownCard} onClose={() => setOpenCard(null)} />}
    </Page>
  );
}
