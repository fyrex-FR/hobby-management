import { useState, useMemo } from 'react';
import {
  TrendingUp,
  CheckCircle2,
  ShoppingBag,
  BarChart3,
  Tag,
  Target,
  PackageCheck,
  PackageOpen,
  Check,
  Globe,
  Pencil,
  Euro,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import type { Card } from '../../types';
import { CardDetail } from '../shared/CardDetail';
import { cdnImg } from '../../lib/cdn';
import { EmptyState, Page, PageHeader, Panel, Spinner, StatTile } from '../ui';

type SalesTab = 'stats' | 'a_traiter' | 'pret' | 'en_ligne' | 'vendu';

const TABS: { key: SalesTab; label: string; icon: LucideIcon; description: string; empty: string }[] = [
  { key: 'stats', label: 'Aperçu', icon: BarChart3, description: 'Tableau de bord financier', empty: '' },
  {
    key: 'a_traiter',
    label: 'À préparer',
    icon: Tag,
    description: 'Fixe un prix puis valide chaque carte pour la préparer à la vente.',
    empty: 'Passe des cartes au statut « À vendre » depuis la collection pour les préparer ici.',
  },
  {
    key: 'pret',
    label: 'Prêtes',
    icon: PackageCheck,
    description: 'Cartes validées, prêtes à être mises en ligne.',
    empty: 'Valide des cartes dans l’onglet « À préparer » pour les retrouver ici.',
  },
  {
    key: 'en_ligne',
    label: 'En ligne',
    icon: Globe,
    description: 'Annonces actuellement en ligne. Marque-les vendues dès qu’elles partent.',
    empty: 'Aucune annonce en ligne pour le moment.',
  },
  {
    key: 'vendu',
    label: 'Vendues',
    icon: ShoppingBag,
    description: 'Historique des ventes.',
    empty: 'Tes ventes apparaîtront ici.',
  },
];

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const euro0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function fmt(n: number) {
  return euro.format(n);
}

function FunnelStage({ label, count, total, color, icon: Icon }: { label: string; count: number; total: number; color: string; icon: LucideIcon }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Icon size={14} className="text-[var(--text-muted)]" />
          {label}
        </span>
        <span className="tabular">
          <span className="font-medium text-[var(--text-primary)]">{count}</span>
          <span className="ml-2 text-xs text-[var(--text-muted)]">{Math.round(pct)} %</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function SalesDashboard({ cards }: { cards: Card[] }) {
  const stats = useMemo(() => {
    const collection = cards.filter((c) => c.status === 'collection');
    const aVendre = cards.filter((c) => c.status === 'a_vendre' && !c.is_listed);
    const enLigne = cards.filter((c) => c.status === 'a_vendre' && c.is_listed);
    const vendues = cards.filter((c) => c.status === 'vendu');

    const investTotal = cards.reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    const investVendues = vendues.reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    const encaisse = vendues.reduce((s, c) => s + (c.price ?? 0), 0);
    const margeReelle = encaisse - investVendues;
    const valeurEstimee = [...aVendre, ...enLigne].reduce((s, c) => s + (c.price ?? 0), 0);
    const investAVendre = [...aVendre, ...enLigne].reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    const margePotentielle = valeurEstimee - investAVendre;
    const roi = investVendues > 0 ? (margeReelle / investVendues) * 100 : null;

    const now = new Date();
    const months: { label: string; total: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('fr-FR', { month: 'short' });
      const monthCards = vendues.filter((c) => {
        const cd = new Date(c.validated_at ?? c.created_at);
        return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
      });
      months.push({ label, total: monthCards.reduce((s, c) => s + (c.price ?? 0), 0), count: monthCards.length });
    }

    return {
      collection: collection.length,
      aVendre: aVendre.length,
      enLigne: enLigne.length,
      vendues: vendues.length,
      totalCards: cards.filter(c => c.status !== 'draft').length,
      investTotal, encaisse, margeReelle, valeurEstimee, margePotentielle, roi, months,
      hasInvest: investTotal > 0,
    };
  }, [cards]);

  const maxMonth = Math.max(...stats.months.map((m) => m.total), 1);
  const sixMonthsTotal = stats.months.reduce((s, m) => s + m.total, 0);
  const marginColor = stats.margeReelle >= 0 ? 'var(--green)' : 'var(--red)';
  const listingCount = stats.aVendre + stats.enLigne;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Total encaissé"
          value={fmt(stats.encaisse)}
          hint={`${stats.vendues} vente${stats.vendues > 1 ? 's' : ''}`}
          icon={Wallet}
          accent
        />
        <StatTile
          label="Marge réelle"
          value={stats.hasInvest ? <span style={{ color: marginColor }}>{stats.margeReelle > 0 ? '+' : ''}{fmt(stats.margeReelle)}</span> : '—'}
          hint={stats.roi !== null ? `ROI ${stats.roi > 0 ? '+' : ''}${stats.roi.toFixed(0)} %` : 'Prix d’achat non renseignés'}
          icon={TrendingUp}
        />
        <StatTile
          label="Valeur en vente"
          value={fmt(stats.valeurEstimee)}
          hint={
            `${listingCount} carte${listingCount > 1 ? 's' : ''}` +
            (stats.hasInvest ? ` · marge potentielle ${stats.margePotentielle > 0 ? '+' : ''}${euro0.format(stats.margePotentielle)}` : '')
          }
          icon={Target}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel title="Pipeline de vente" icon={PackageOpen}>
          <div className="space-y-4">
            <FunnelStage label="Collection" count={stats.collection} total={stats.totalCards} color="var(--text-muted)" icon={PackageOpen} />
            <FunnelStage label="À vendre" count={stats.aVendre} total={stats.totalCards} color="var(--accent)" icon={Tag} />
            <FunnelStage label="En ligne" count={stats.enLigne} total={stats.totalCards} color="var(--blue)" icon={Globe} />
            <FunnelStage label="Vendues" count={stats.vendues} total={stats.totalCards} color="var(--green)" icon={CheckCircle2} />
          </div>
        </Panel>

        <Panel
          title="Ventes des 6 derniers mois"
          icon={BarChart3}
          action={<span className="tabular text-[13px] font-medium text-[var(--price)]">{euro0.format(sixMonthsTotal)}</span>}
        >
          <div className="flex h-44 items-stretch gap-2 sm:gap-3">
            {stats.months.map((m) => (
              <div
                key={m.label}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                title={`${m.label} : ${euro.format(m.total)} · ${m.count} vente${m.count > 1 ? 's' : ''}`}
              >
                <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                  {m.total > 0 && (
                    <span className="tabular text-[11px] text-[var(--text-secondary)]">{euro0.format(m.total)}</span>
                  )}
                  <div
                    className={`w-full max-w-10 rounded-md ${m.total > 0 ? 'bg-[var(--accent)]' : 'bg-[var(--bg-elevated)]'}`}
                    style={{ height: m.total > 0 ? `${Math.max((m.total / maxMonth) * 75, 3)}%` : 3 }}
                  />
                </div>
                <span className="text-xs capitalize text-[var(--text-muted)]">{m.label.replace('.', '')}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PriceInput({ card, onSave }: { card: Card; onSave: (price: number) => void }) {
  const [value, setValue] = useState(card.price?.toString() ?? '');
  const [editing, setEditing] = useState(card.price == null);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="ui-btn ui-btn-sm tabular"
        data-active
        title="Modifier le prix"
      >
        {card.price != null ? fmt(card.price) : '—'}
        <Pencil size={12} />
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseFloat(value);
        if (!isNaN(n) && n > 0) { onSave(n); setEditing(false); }
      }}
      className="flex items-center gap-1"
    >
      <div className="relative">
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="Prix"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="ui-input tabular h-8 w-24 pr-6"
          aria-label="Prix de vente"
        />
        <Euro size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      </div>
      <button type="submit" className="ui-btn ui-btn-sm ui-btn-icon ui-btn-primary" aria-label="Enregistrer le prix">
        <Check size={14} />
      </button>
    </form>
  );
}

function SalesCard({ card, tab, onUpdate, onClick }: { card: Card; tab: SalesTab; onUpdate: (id: string, fields: Partial<Card>) => void; onClick: () => void }) {
  const sub = [card.year, card.brand, card.set_name].filter(Boolean).join(' · ');

  return (
    <div className="ui-card flex items-center gap-3 p-3">
      <button onClick={onClick} className="group flex min-w-0 flex-1 items-center gap-3 text-left" title="Ouvrir la fiche">
        <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]">
          {card.image_front_url ? (
            <img src={cdnImg(card.image_front_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]"><PackageOpen size={18} /></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-[var(--text-primary)] group-hover:underline">{card.player ?? 'Joueur inconnu'}</h3>
          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{sub || '—'}</p>
        </div>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        {tab === 'a_traiter' && (
          <>
            <PriceInput card={card} onSave={(price) => onUpdate(card.id, { price })} />
            <button
              onClick={() => onUpdate(card.id, { listing_validated: true })}
              disabled={card.price == null}
              className="ui-btn ui-btn-sm"
              title={card.price == null ? 'Fixe un prix avant de valider' : 'Valider pour la vente'}
            >
              <Check size={14} />
              Valider
            </button>
          </>
        )}

        {tab === 'pret' && (
          <>
            <span className="tabular text-sm font-medium text-[var(--price)]">{card.price != null ? fmt(card.price) : '—'}</span>
            <button
              onClick={() => onUpdate(card.id, { is_listed: true })}
              className="ui-btn ui-btn-sm ui-btn-primary"
              title="Marquer comme en ligne"
            >
              <Globe size={14} />
              En ligne
            </button>
          </>
        )}

        {tab === 'en_ligne' && (
          <>
            <span className="tabular text-sm font-medium text-[var(--text-primary)]">{card.price != null ? fmt(card.price) : '—'}</span>
            <button
              onClick={() => onUpdate(card.id, { status: 'vendu', is_listed: false })}
              className="ui-btn ui-btn-sm ui-btn-success"
              title="Déclarer la carte vendue"
            >
              <CheckCircle2 size={14} />
              Vendue
            </button>
          </>
        )}

        {tab === 'vendu' && (
          <span className="tabular text-sm font-medium text-[var(--green)]">{card.price != null ? fmt(card.price) : '—'}</span>
        )}
      </div>
    </div>
  );
}

export function SalesView() {
  const { data: cards = [], isLoading } = useCards();
  const updateCard = useUpdateCard();
  const [tab, setTab] = useState<SalesTab>('stats');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const byTab = useMemo(() => ({
    a_traiter: cards.filter(c => c.status === 'a_vendre' && !c.listing_validated && !c.is_listed),
    pret: cards.filter(c => c.status === 'a_vendre' && c.listing_validated && !c.is_listed),
    en_ligne: cards.filter(c => c.status === 'a_vendre' && c.is_listed),
    vendu: cards.filter(c => c.status === 'vendu'),
  }), [cards]);

  const totalAVendre = byTab.a_traiter.length + byTab.pret.length + byTab.en_ligne.length;
  const current = TABS.find((t) => t.key === tab);

  if (isLoading) {
    return (
      <Page>
        <PageHeader title="Ventes" />
        <Spinner label="Chargement…" className="py-24" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Ventes"
        subtitle={<span className="tabular">{totalAVendre} carte{totalAVendre > 1 ? 's' : ''} en cours de vente</span>}
      />

      <div className="ui-segmented max-w-full overflow-x-auto no-scrollbar" role="tablist" aria-label="Étapes de vente">
        {TABS.map((t) => {
          const count = t.key !== 'stats' ? byTab[t.key as keyof typeof byTab].length : null;
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>
              <t.icon size={14} className="hidden sm:block" />
              {t.label}
              {count != null && count > 0 && <span className="count">{count}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'stats' && <SalesDashboard cards={cards} />}

      {tab !== 'stats' && (
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--text-muted)]">{current?.description}</p>
          {byTab[tab as keyof typeof byTab].length === 0 ? (
            <div className="ui-card">
              <EmptyState icon={current?.icon ?? ShoppingBag} title="Rien pour l’instant" description={current?.empty} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
              {byTab[tab as keyof typeof byTab].map(card => (
                <SalesCard
                  key={card.id}
                  card={card}
                  tab={tab}
                  onUpdate={(id, f) => updateCard.mutateAsync({ id, ...f })}
                  onClick={() => setSelectedCard(card)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {selectedCard && <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </Page>
  );
}
