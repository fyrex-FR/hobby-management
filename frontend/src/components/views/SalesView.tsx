import { useState, useMemo } from 'react';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import type { Card } from '../../types';
import { CardDetail } from '../shared/CardDetail';

type SalesTab = 'stats' | 'a_traiter' | 'pret' | 'en_ligne' | 'vendu';

const TABS: { key: SalesTab; label: string; description: string }[] = [
  { key: 'stats', label: 'Stats', description: 'Tableau de bord des ventes' },
  { key: 'a_traiter', label: 'À traiter', description: 'Cartes à vendre sans prix ni validation' },
  { key: 'pret', label: 'Prêtes', description: 'Prix fixé, validées — prêtes à poster' },
  { key: 'en_ligne', label: 'En ligne', description: 'Postées sur Vinted' },
  { key: 'vendu', label: 'Vendues', description: 'Archivées' },
];

/* ── Stats helpers ─────────────────────────────────────────── */

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function KpiCard({
  label, value, sub, accent, positive,
}: {
  label: string; value: string; sub?: string; accent?: boolean; positive?: boolean;
}) {
  const color = positive === undefined
    ? accent ? 'var(--accent)' : 'var(--text-primary)'
    : positive ? 'var(--green)' : 'var(--red)';
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-2xl font-black tabular-nums leading-none" style={{ color }}>{value}</span>
      {sub && <span className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-24 shrink-0 text-right" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="flex-1 h-6 rounded-lg overflow-hidden relative" style={{ background: 'var(--bg-elevated)' }}>
        <div
          className="h-full rounded-lg transition-all duration-700 flex items-center px-2"
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, background: color }}
        >
          {count > 0 && <span className="text-[11px] font-bold text-black/70">{count}</span>}
        </div>
      </div>
      <span className="text-xs w-8 shrink-0 font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{count}</span>
    </div>
  );
}

function SalesDashboard({ cards }: { cards: Card[] }) {
  const stats = useMemo(() => {
    const collection = cards.filter((c) => c.status === 'collection');
    const aVendre = cards.filter((c) => c.status === 'a_vendre' && !cards.find((x) => x.id === c.id)?.is_listed);
    const enLigne = cards.filter((c) => c.status === 'a_vendre' && c.is_listed);
    const vendues = cards.filter((c) => c.status === 'vendu');

    // Investissement total (toutes cartes avec purchase_price)
    const investTotal = cards.reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    // Investissement sur cartes vendues seulement
    const investVendues = vendues.reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    // Encaissé
    const encaisse = vendues.reduce((s, c) => s + (c.price ?? 0), 0);
    // Marge réelle
    const margeReelle = encaisse - investVendues;
    // Valeur estimée (cartes à vendre avec prix fixé)
    const valeurEstimee = [...aVendre, ...enLigne].reduce((s, c) => s + (c.price ?? 0), 0);
    // Invest sur cartes à vendre
    const investAVendre = [...aVendre, ...enLigne].reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    // Marge potentielle
    const margePotentielle = valeurEstimee - investAVendre;
    // ROI
    const roi = investVendues > 0 ? (margeReelle / investVendues) * 100 : null;

    // Ventes par mois (6 derniers mois)
    const now = new Date();
    const months: { label: string; total: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      const monthCards = vendues.filter((c) => {
        const cd = new Date(c.validated_at ?? c.created_at);
        return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
      });
      months.push({ label, total: monthCards.reduce((s, c) => s + (c.price ?? 0), 0), count: monthCards.length });
    }

    const totalCards = cards.filter((c) => c.status !== 'draft').length;

    return {
      collection: collection.length,
      aVendre: aVendre.length,
      enLigne: enLigne.length,
      vendues: vendues.length,
      totalCards,
      investTotal,
      encaisse,
      margeReelle,
      valeurEstimee,
      margePotentielle,
      roi,
      months,
      hasInvest: investTotal > 0,
    };
  }, [cards]);

  const maxMonth = Math.max(...stats.months.map((m) => m.total), 1);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Encaissé" value={fmt(stats.encaisse)} sub={`${stats.vendues} carte${stats.vendues !== 1 ? 's' : ''} vendues`} accent />
        <KpiCard
          label="Marge réelle"
          value={stats.hasInvest ? fmt(stats.margeReelle) : '—'}
          sub={stats.roi !== null ? `ROI ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(0)}%` : 'Renseigne les prix d\'achat'}
          positive={stats.hasInvest ? stats.margeReelle >= 0 : undefined}
        />
        <KpiCard
          label="Marge potentielle"
          value={stats.valeurEstimee > 0 ? fmt(stats.margePotentielle) : '—'}
          sub={stats.valeurEstimee > 0 ? `Sur ${fmt(stats.valeurEstimee)} estimés` : 'Fixe des prix de vente'}
          positive={stats.valeurEstimee > 0 ? stats.margePotentielle >= 0 : undefined}
        />
        <KpiCard label="Investissement total" value={stats.hasInvest ? fmt(stats.investTotal) : '—'} sub="Toutes cartes confondues" />
        <KpiCard label="Valeur estimée" value={fmt(stats.valeurEstimee)} sub="Cartes à vendre avec prix" />
        <KpiCard label="En cours" value={String(stats.aVendre + stats.enLigne)} sub={`dont ${stats.enLigne} en ligne`} />
      </div>

      {/* Funnel */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h3 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--text-muted)' }}>Funnel</h3>
        <FunnelBar label="Collection" count={stats.collection} total={stats.totalCards} color="var(--bg-elevated)" />
        <FunnelBar label="À vendre" count={stats.aVendre} total={stats.totalCards} color="var(--accent)" />
        <FunnelBar label="En ligne" count={stats.enLigne} total={stats.totalCards} color="var(--blue)" />
        <FunnelBar label="Vendues" count={stats.vendues} total={stats.totalCards} color="var(--green)" />
      </div>

      {/* Ventes par mois */}
      {stats.months.some((m) => m.count > 0) && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--text-muted)' }}>Ventes / mois</h3>
          <div className="flex items-end gap-2 h-24">
            {stats.months.map((m) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold" style={{ color: m.total > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {m.total > 0 ? fmt(m.total).replace(' €', '€') : ''}
                </span>
                <div className="w-full rounded-t-md transition-all duration-700" style={{
                  height: `${Math.max((m.total / maxMonth) * 64, m.count > 0 ? 4 : 0)}px`,
                  background: m.count > 0 ? 'var(--accent)' : 'var(--bg-elevated)',
                  opacity: m.count > 0 ? 1 : 0.4,
                }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function isReady(card: Card) {
  return card.status === 'a_vendre' && card.listing_validated && card.price != null;
}
function isLive(card: Card) {
  return card.status === 'a_vendre' && card.is_listed;
}
function isToProcess(card: Card) {
  return card.status === 'a_vendre' && !card.listing_validated && !card.is_listed;
}

function PriceInput({ card, onSave }: { card: Card; onSave: (price: number) => void }) {
  const [value, setValue] = useState(card.price?.toString() ?? '');
  const [editing, setEditing] = useState(card.price == null);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-sm font-semibold transition-colors hover:opacity-70"
        style={{ color: 'var(--accent)' }}
      >
        {card.price} €
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
      <input
        autoFocus
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0.00"
        className="w-20 rounded-lg px-2 py-1 text-xs outline-none"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      />
      <button type="submit" className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--accent)', color: '#0d0c0b' }}>
        OK
      </button>
    </form>
  );
}

function SalesCard({
  card,
  tab,
  onUpdate,
  onClick,
}: {
  card: Card;
  tab: SalesTab;
  onUpdate: (id: string, fields: Partial<Card>) => void;
  onClick: () => void;
}) {

  return (
    <div
      className="rounded-xl transition-colors"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
    <div className="flex items-center gap-3 px-4 py-3 group">
      {/* Thumbnail */}
      <button onClick={onClick} className="shrink-0">
        {card.image_front_url ? (
          <img src={card.image_front_url} alt="" className="w-10 h-14 object-cover rounded-lg group-hover:opacity-80 transition-opacity" />
        ) : (
          <div className="w-10 h-14 rounded-lg flex items-center justify-center text-lg" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
        )}
      </button>

      {/* Info */}
      <button onClick={onClick} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {card.player ?? '—'}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
          {[card.year, card.brand, card.set_name, card.insert_name].filter(Boolean).join(' · ')}
        </p>
        {card.numbered && (
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>{card.numbered}</p>
        )}
      </button>

      {/* Actions par tab */}
      <div className="flex items-center gap-2 shrink-0">
        {tab === 'a_traiter' && (
          <>
            <PriceInput card={card} onSave={(price) => onUpdate(card.id, { price })} />
<button
              onClick={() => onUpdate(card.id, { listing_validated: true })}
              disabled={card.price == null}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-30"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              title={card.price == null ? 'Fixe un prix d\'abord' : 'Valider pour Vinted'}
            >
              Valider →
            </button>
          </>
        )}

        {tab === 'pret' && (
          <>
            <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{card.price} €</span>
            <button
              onClick={() => onUpdate(card.id, { is_listed: true })}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{ background: 'var(--accent)', color: '#0d0c0b' }}
            >
              Posté ✓
            </button>
          </>
        )}

        {tab === 'en_ligne' && (
          <>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{card.price} €</span>
            <button
              onClick={() => onUpdate(card.id, { status: 'vendu', is_listed: false })}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{ background: 'rgba(61,190,122,0.1)', border: '1px solid rgba(61,190,122,0.2)', color: 'var(--green)' }}
            >
              Vendu ✓
            </button>
          </>
        )}

        {tab === 'vendu' && (
          <div className="text-right">
            <div className="text-sm font-semibold" style={{ color: 'var(--green)' }}>{card.price} €</div>
            {card.purchase_price != null && (
              <div className="text-[11px]" style={{ color: card.price != null && card.price - card.purchase_price >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {card.price != null ? (card.price - card.purchase_price >= 0 ? '+' : '') + (card.price - card.purchase_price).toFixed(2) : ''} €
              </div>
            )}
          </div>
        )}
      </div>
    </div>
</div>
  );
}

export function SalesView() {
  const { data: cards = [], isLoading } = useCards();
  const updateCard = useUpdateCard();
  const [tab, setTab] = useState<SalesTab>('stats');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const sellableCards = cards.filter((c) => c.status === 'a_vendre' || c.status === 'vendu');

  const byTab: Record<Exclude<SalesTab, 'stats'>, Card[]> = {
    a_traiter: sellableCards.filter(isToProcess),
    pret: sellableCards.filter((c) => isReady(c) && !isLive(c)),
    en_ligne: sellableCards.filter(isLive),
    vendu: cards.filter((c) => c.status === 'vendu'),
  };

  const totalAVendre = byTab.a_traiter.length + byTab.pret.length + byTab.en_ligne.length;

  async function handleUpdate(id: string, fields: Partial<Card>) {
    await updateCard.mutateAsync({ id, ...fields });
  }

  const currentTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Ventes</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {totalAVendre} carte{totalAVendre !== 1 ? 's' : ''} en cours de vente
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 p-1 rounded-2xl mb-6"
          style={{ background: 'var(--bg-secondary)' }}
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 flex flex-col items-center py-2.5 px-2 rounded-xl transition-all"
              style={{
                background: tab === t.key ? 'var(--bg-elevated)' : 'transparent',
                border: tab === t.key ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {t.label}
              </span>
              {t.key !== 'stats' && (
                <span
                  className="text-lg font-bold leading-tight mt-0.5"
                  style={{ color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {byTab[t.key as Exclude<SalesTab, 'stats'>]?.length ?? ''}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Description */}
        {tab !== 'stats' && (
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {currentTab.description}
          </p>
        )}

        {/* Stats dashboard */}
        {tab === 'stats' && <SalesDashboard cards={cards} />}

        {/* List */}
        {tab !== 'stats' && (isLoading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
          </div>
        ) : byTab[tab as Exclude<SalesTab, 'stats'>]?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="text-3xl">
              {tab === 'a_traiter' ? '🎉' : tab === 'pret' ? '⏳' : tab === 'en_ligne' ? '📭' : '📦'}
            </span>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {tab === 'a_traiter' && 'Rien à traiter — tout est sous contrôle.'}
              {tab === 'pret' && 'Aucune carte prête. Fixe un prix et valide.'}
              {tab === 'en_ligne' && 'Aucune carte en ligne pour le moment.'}
              {tab === 'vendu' && 'Aucune vente pour le moment.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {byTab[tab as Exclude<SalesTab, 'stats'>].map((card) => (
              <SalesCard
                key={card.id}
                card={card}
                tab={tab}
                onUpdate={handleUpdate}
                onClick={() => setSelectedCard(card)}
              />
            ))}
          </div>
        ))}

        {/* Total vendu */}
        {tab === 'vendu' && byTab.vendu.length > 0 && (() => {
          const totalSold = byTab.vendu.reduce((sum, c) => sum + (c.price ?? 0), 0);
          const totalBought = byTab.vendu.reduce((sum, c) => sum + (c.purchase_price ?? 0), 0);
          const margin = totalSold - totalBought;
          const hasMargin = byTab.vendu.some((c) => c.purchase_price != null);
          return (
            <div
              className="mt-4 px-4 py-3 rounded-xl flex items-center justify-between"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total encaissé</div>
                {hasMargin && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Marge nette</div>}
              </div>
              <div className="text-right">
                <div className="text-lg font-bold" style={{ color: 'var(--green)' }}>{totalSold.toFixed(2)} €</div>
                {hasMargin && (
                  <div className="text-sm font-semibold" style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {margin >= 0 ? '+' : ''}{margin.toFixed(2)} €
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {selectedCard && (
        <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}
