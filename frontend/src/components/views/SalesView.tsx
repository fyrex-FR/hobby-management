import { useMemo, useRef, useState } from 'react';
import {
  TrendingUp,
  CheckCircle2,
  ShoppingBag,
  BarChart3,
  Tag,
  Target,
  PackageOpen,
  Globe,
  Pencil,
  Wallet,
  BadgeEuro,
  Send,
  Clock,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import type { Card } from '../../types';
import { CardDetail } from '../shared/CardDetail';
import { SoldDialog } from '../shared/SoldDialog';
import { PricingFlow } from '../shared/PricingFlow';
import { VintedPublishFlow } from '../shared/VintedPublishFlow';
import { EbayLogo, VintedLogo } from '../shared/EbayLogo';
import { cdnImg } from '../../lib/cdn';
import { displayPrice } from '../../lib/collectionFilters';
import { normalizeParallelName } from '../../lib/cardQuality';
import { errorMessage, toast } from '../../lib/feedback';
import { SALE_CHANNEL_LABEL, isOnline, soldAt, soldPrice } from '../../lib/sales';
import { EmptyState, Page, PageHeader, Panel, Spinner, StatTile } from '../ui';

type SalesTab = 'stats' | 'pricer' | 'publier' | 'en_ligne' | 'reserve' | 'vendu';

/**
 * Les étapes se lisent sur les cartes elles-mêmes (prix, annonces, statut) :
 * plus de « Valider » ni de « Marquer en ligne » à tenir à jour à la main.
 */
const TABS: { key: SalesTab; label: string; icon: LucideIcon; description: string; empty: string }[] = [
  { key: 'stats', label: 'Aperçu', icon: BarChart3, description: '', empty: '' },
  {
    key: 'pricer',
    label: 'À pricer',
    icon: BadgeEuro,
    description: 'Cartes à vendre sans prix. Entrée enregistre et passe à la suivante.',
    empty: 'Toutes tes cartes à vendre ont un prix.',
  },
  {
    key: 'publier',
    label: 'À publier',
    icon: Send,
    description: 'Prix fixé, aucune annonce en ligne. Ouvre une carte pour la publier, ou publie tout sur Vinted en chaîne.',
    empty: 'Rien à publier : tout ce qui a un prix est en ligne.',
  },
  {
    key: 'en_ligne',
    label: 'En ligne',
    icon: Globe,
    description: 'Annonces Vinted, eBay ou ailleurs. Déclare la vente dès qu’une carte part.',
    empty: 'Aucune annonce en ligne pour le moment.',
  },
  {
    key: 'reserve',
    label: 'Réservées',
    icon: Clock,
    description: 'Promises à un acheteur : conclus la vente ou remets-les en vente.',
    empty: 'Aucune carte réservée.',
  },
  {
    key: 'vendu',
    label: 'Vendues',
    icon: ShoppingBag,
    description: 'Historique des ventes, les plus récentes d’abord.',
    empty: 'Tes ventes apparaîtront ici.',
  },
];

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const euro0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmt = (n: number) => euro.format(n);
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

function identity(card: Card): string {
  const parallel = card.parallel_name && card.parallel_name !== 'Base' ? normalizeParallelName(card.parallel_name) : null;
  return [card.year, card.set_name || card.brand, card.insert_name, parallel, card.numbered].filter(Boolean).join(' · ');
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
    const live = cards.filter((c) => c.status !== 'draft');
    const sold = live.filter((c) => c.status === 'vendu');
    const forSale = live.filter((c) => c.status === 'a_vendre');
    const reserved = live.filter((c) => c.status === 'reserve');
    const known = sold.filter((c) => soldPrice(c) != null);
    const encaisse = known.reduce((s, c) => s + (soldPrice(c) ?? 0), 0);
    // Marge : seulement sur les ventes dont on connaît le prix encaissé ET le prix d'achat.
    const withCost = known.filter((c) => c.purchase_price != null);
    const marge = withCost.reduce((s, c) => s + (soldPrice(c) ?? 0) - (c.purchase_price ?? 0), 0);
    const enVente = [...forSale, ...reserved].reduce((s, c) => s + (displayPrice(c) ?? 0) * (c.quantity ?? 1), 0);

    const now = new Date();
    const months: { label: string; total: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const inMonth = sold.filter((c) => {
        const at = soldAt(c);
        if (!at) return false;
        const sd = new Date(at);
        return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear();
      });
      months.push({ label: d.toLocaleDateString('fr-FR', { month: 'short' }), total: inMonth.reduce((s, c) => s + (soldPrice(c) ?? 0), 0), count: inMonth.length });
    }

    return {
      total: live.length,
      collection: live.filter((c) => c.status === 'collection').length,
      offline: forSale.filter((c) => !isOnline(c)).length,
      online: forSale.filter(isOnline).length,
      reserved: reserved.length,
      sold: sold.length,
      unknownPrice: sold.length - known.length,
      undated: sold.filter((c) => !soldAt(c)).length,
      encaisse, marge, withCost: withCost.length, enVente,
      forSaleCount: forSale.length + reserved.length,
      months,
    };
  }, [cards]);

  const maxMonth = Math.max(...stats.months.map((m) => m.total), 1);
  const sixMonths = stats.months.reduce((s, m) => s + m.total, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Encaissé"
          value={fmt(stats.encaisse)}
          hint={`${plural(stats.sold, 'vente')}${stats.unknownPrice ? ` · ${stats.unknownPrice} sans prix connu` : ''}`}
          icon={Wallet}
          accent
        />
        <StatTile
          label="Marge"
          value={stats.withCost ? <span style={{ color: stats.marge >= 0 ? 'var(--green)' : 'var(--red)' }}>{stats.marge > 0 ? '+' : ''}{fmt(stats.marge)}</span> : '—'}
          hint={stats.withCost ? `Sur ${plural(stats.withCost, 'vente')} avec prix d’achat` : 'Renseigne des prix d’achat pour la calculer'}
          icon={TrendingUp}
        />
        <StatTile
          label="En vente"
          value={fmt(stats.enVente)}
          hint={`${plural(stats.forSaleCount, 'carte')} à vendre ou réservée${stats.forSaleCount > 1 ? 's' : ''}, au prix demandé`}
          icon={Target}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel title="Où en sont tes cartes" icon={PackageOpen}>
          <div className="space-y-4">
            <FunnelStage label="Collection" count={stats.collection} total={stats.total} color="var(--text-muted)" icon={PackageOpen} />
            <FunnelStage label="À vendre, pas en ligne" count={stats.offline} total={stats.total} color="var(--accent)" icon={Tag} />
            <FunnelStage label="En ligne" count={stats.online} total={stats.total} color="var(--violet)" icon={Globe} />
            <FunnelStage label="Réservées" count={stats.reserved} total={stats.total} color="var(--blue)" icon={Clock} />
            <FunnelStage label="Vendues" count={stats.sold} total={stats.total} color="var(--green)" icon={CheckCircle2} />
          </div>
        </Panel>

        <Panel
          title="Encaissé, 6 derniers mois"
          icon={BarChart3}
          action={<span className="tabular text-[13px] font-medium text-[var(--price)]">{euro0.format(sixMonths)}</span>}
        >
          <div className="flex h-44 items-stretch gap-2 sm:gap-3">
            {stats.months.map((m) => (
              <div key={m.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${m.label} : ${fmt(m.total)} · ${plural(m.count, 'vente')}`}>
                <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                  {m.total > 0 && <span className="tabular text-[11px] text-[var(--text-secondary)]">{euro0.format(m.total)}</span>}
                  <div
                    className={`w-full max-w-10 rounded-md ${m.total > 0 ? 'bg-[var(--accent)]' : 'bg-[var(--bg-elevated)]'}`}
                    style={{ height: m.total > 0 ? `${Math.max((m.total / maxMonth) * 75, 3)}%` : 3 }}
                  />
                </div>
                <span className="text-xs capitalize text-[var(--text-muted)]">{m.label.replace('.', '')}</span>
              </div>
            ))}
          </div>
          {stats.undated > 0 && (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {plural(stats.undated, 'vente')} sans date (avant le suivi des ventes) n’apparaissent pas ici.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Prix saisi en ligne : Entrée enregistre puis passe au champ suivant de la liste. */
function PriceField({ card, autoFocus, onSave }: { card: Card; autoFocus: boolean; onSave: (price: number) => void }) {
  const [value, setValue] = useState('');
  // Entrée enregistre puis déplace le focus : le blur qui suit ne doit pas réenregistrer.
  const saved = useRef(false);
  const save = (input: HTMLInputElement) => {
    if (saved.current) return;
    const n = Number(value.replace(',', '.'));
    if (!value.trim() || !Number.isFinite(n) || n <= 0) {
      toast.error('Prix invalide', { description: 'Saisis un montant, par exemple 12,50.' });
      return;
    }
    const fields = [...document.querySelectorAll<HTMLInputElement>('input[data-price-field]')];
    const next = fields[fields.indexOf(input) + 1];
    saved.current = true;
    onSave(n);
    next?.focus();
  };
  return (
    <div className="relative">
      <input
        data-price-field
        autoFocus={autoFocus}
        inputMode="decimal"
        placeholder="Prix"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(e.currentTarget); } }}
        onBlur={(e) => { if (value.trim()) save(e.currentTarget); }}
        className="ui-input tabular h-9 w-24 pr-6 text-right"
        aria-label={`Prix de ${card.player ?? 'la carte'}`}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">€</span>
    </div>
  );
}

function OnlineMarks({ card }: { card: Card }) {
  return (
    <span className="flex items-center gap-1.5">
      {card.vinted_url && <a href={card.vinted_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Voir l’annonce Vinted"><VintedLogo width={38} height={11} /></a>}
      {card.ebay_url && <a href={card.ebay_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Voir l’annonce eBay"><EbayLogo width={26} height={11} /></a>}
      {!card.vinted_url && !card.ebay_offer_id && card.is_listed && <span className="text-[11px] text-[var(--text-muted)]">Ailleurs</span>}
    </span>
  );
}

function SalesRow({ card, children, meta, onOpen }: { card: Card; children: React.ReactNode; meta?: React.ReactNode; onOpen: () => void }) {
  return (
    <div className="ui-card flex items-center gap-3 p-2.5">
      <button onClick={onOpen} className="group flex min-w-0 flex-1 items-center gap-3 text-left" title="Ouvrir la fiche">
        <div className="h-[72px] w-[52px] shrink-0 overflow-hidden rounded-md bg-[var(--bg-elevated)]">
          {card.image_front_url
            ? <img src={cdnImg(card.image_front_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]"><PackageOpen size={18} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:underline">{card.player ?? 'Joueur inconnu'}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{identity(card) || '—'}</p>
          {meta && <div className="mt-1 text-xs text-[var(--text-muted)]">{meta}</div>}
        </div>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">{children}</div>
    </div>
  );
}

export function SalesView() {
  const { data: cards = [], isLoading } = useCards();
  const updateCard = useUpdateCard();
  const [tab, setTab] = useState<SalesTab>('stats');
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [selling, setSelling] = useState<Card | null>(null);
  const [pricing, setPricing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const byTab = useMemo(() => {
    const forSale = cards.filter((c) => c.status === 'a_vendre');
    return {
      pricer: forSale.filter((c) => displayPrice(c) == null),
      publier: forSale.filter((c) => displayPrice(c) != null && !isOnline(c)),
      en_ligne: forSale.filter(isOnline),
      reserve: cards.filter((c) => c.status === 'reserve'),
      vendu: cards
        .filter((c) => c.status === 'vendu')
        .sort((a, b) => (soldAt(b) ?? '').localeCompare(soldAt(a) ?? '')),
    };
  }, [cards]);

  // La fiche ouverte suit les données fraîches (prix, statut changés ailleurs).
  const shown = openCard ? cards.find((c) => c.id === openCard.id) ?? openCard : null;
  const inProgress = byTab.pricer.length + byTab.publier.length + byTab.en_ligne.length + byTab.reserve.length;
  const current = TABS.find((t) => t.key === tab)!;
  const list = tab === 'stats' ? [] : byTab[tab];

  function update(card: Card, fields: Partial<Card>, label: string) {
    updateCard.mutate({ id: card.id, ...fields }, {
      onSuccess: () => toast.success(label, { description: card.player ?? undefined }),
      onError: (e) => toast.error('Modification non enregistrée', { description: errorMessage(e) }),
    });
  }

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
      <PageHeader title="Ventes" subtitle={<span className="tabular">{plural(inProgress, 'carte')} en cours de vente</span>} />

      <div className="ui-segmented max-w-full overflow-x-auto no-scrollbar" role="tablist" aria-label="Étapes de vente">
        {TABS.map((t) => {
          const count = t.key !== 'stats' ? byTab[t.key].length : null;
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} data-active={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-[var(--text-secondary)]">{current.description}</p>
            {tab === 'pricer' && list.length > 0 && (
              <button onClick={() => setPricing(true)} className="ui-btn ui-btn-sm">
                <BadgeEuro size={14} /> Pricer une à une avec les ventes eBay
              </button>
            )}
            {tab === 'publier' && list.length > 0 && (
              <button onClick={() => setPublishing(true)} className="ui-btn ui-btn-sm ui-btn-primary">
                <VintedLogo width={36} height={11} /> Publier les {list.length} en chaîne
              </button>
            )}
          </div>

          {list.length === 0 ? (
            <div className="ui-card">
              <EmptyState icon={current.icon} title="Rien pour l’instant" description={current.empty} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 xl:gap-3">
              {list.map((card, i) => {
                const price = displayPrice(card);
                if (tab === 'pricer') {
                  return (
                    <SalesRow key={card.id} card={card} onOpen={() => setOpenCard(card)}>
                      <PriceField card={card} autoFocus={i === 0} onSave={(p) => update(card, { price: p }, `Prix : ${fmt(p)}`)} />
                    </SalesRow>
                  );
                }
                if (tab === 'publier') {
                  return (
                    <SalesRow key={card.id} card={card} onOpen={() => setOpenCard(card)}>
                      <span className="tabular text-sm font-semibold text-[var(--price)]">{price != null ? fmt(price) : '—'}</span>
                      <button onClick={() => update(card, { is_listed: true }, 'Marquée en ligne')} className="ui-btn ui-btn-sm" title="Annonce publiée sur un autre site">
                        <Globe size={14} /> En ligne ailleurs
                      </button>
                    </SalesRow>
                  );
                }
                if (tab === 'en_ligne') {
                  return (
                    <SalesRow key={card.id} card={card} onOpen={() => setOpenCard(card)} meta={<OnlineMarks card={card} />}>
                      <span className="tabular text-sm font-semibold text-[var(--text-primary)]">{price != null ? fmt(price) : '—'}</span>
                      <button onClick={() => setSelling(card)} className="ui-btn ui-btn-sm ui-btn-primary">
                        <CheckCircle2 size={14} /> Vendue…
                      </button>
                    </SalesRow>
                  );
                }
                if (tab === 'reserve') {
                  return (
                    <SalesRow key={card.id} card={card} onOpen={() => setOpenCard(card)} meta={<OnlineMarks card={card} />}>
                      <span className="tabular text-sm font-semibold text-[var(--text-primary)]">{price != null ? fmt(price) : '—'}</span>
                      <div className="flex gap-1.5">
                        <button onClick={() => update(card, { status: 'a_vendre' }, 'Remise en vente')} className="ui-btn ui-btn-sm ui-btn-icon" title="Remettre en vente" aria-label="Remettre en vente">
                          <Undo2 size={14} />
                        </button>
                        <button onClick={() => setSelling(card)} className="ui-btn ui-btn-sm ui-btn-primary">
                          <CheckCircle2 size={14} /> Vendue…
                        </button>
                      </div>
                    </SalesRow>
                  );
                }
                const sp = soldPrice(card);
                const at = soldAt(card);
                return (
                  <SalesRow
                    key={card.id}
                    card={card}
                    onOpen={() => setOpenCard(card)}
                    meta={[at ? new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date inconnue', card.sold_channel ? SALE_CHANNEL_LABEL[card.sold_channel] : null].filter(Boolean).join(' · ')}
                  >
                    {sp != null
                      ? <span className="tabular text-sm font-semibold text-[var(--green)]">{fmt(sp)}</span>
                      : <span className="tabular text-xs text-[var(--text-muted)]" title="Prix encaissé inconnu">demandé {price != null ? fmt(price) : '—'}</span>}
                    <button onClick={() => setSelling(card)} className="ui-btn ui-btn-sm ui-btn-ghost ui-btn-icon" title="Corriger la vente" aria-label="Corriger la vente">
                      <Pencil size={13} />
                    </button>
                  </SalesRow>
                );
              })}
            </div>
          )}
        </div>
      )}

      {shown && <CardDetail card={shown} onClose={() => setOpenCard(null)} />}
      {selling && (
        <SoldDialog
          cards={[selling]}
          initialTotal={selling.status === 'vendu' ? soldPrice(selling) : undefined}
          title={selling.status === 'vendu' ? `Corriger la vente de ${selling.player ?? 'la carte'}` : undefined}
          onClose={() => setSelling(null)}
        />
      )}
      {pricing && <PricingFlow cards={byTab.pricer} onClose={() => setPricing(false)} />}
      {publishing && <VintedPublishFlow cards={byTab.publier} onClose={() => setPublishing(false)} />}
    </Page>
  );
}
