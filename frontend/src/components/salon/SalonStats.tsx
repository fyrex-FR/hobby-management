import { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Filter, HandCoins, RotateCcw, Search, ShoppingBasket, Store, TrendingUp } from 'lucide-react';
import { EmptyState, Notice, Panel, Spinner, StatTile } from '../ui';
import { formatEuro } from '../../lib/salon';
import { funnelSteps, hourly, localDay, shiftDay, useResetStats, useSalonStats, type TopCard } from '../../lib/salonStats';
import { confirmDialog, errorMessage, toast } from '../../lib/feedback';
import { Thumb } from './parts';
import { cardMeta } from './cardText';
import { SalonDelist } from './SalonDelist';

const pct = (v: number) => `${Math.round(v * 100)} %`;

function dayLabel(day: string): string {
  const today = localDay();
  if (day === today) return "Aujourd'hui";
  if (day === shiftDay(today, -1)) return 'Hier';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function TopList({ items, unit, empty }: { items: TopCard[]; unit: string; empty: string }) {
  if (!items.length) return <p className="py-3 text-[13px] text-[var(--text-muted)]">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map(({ card, count, sold }) => (
        <li key={card.id} className="flex items-center gap-3 py-2">
          <Thumb url={card.image_front_url} className="h-12 w-9 shrink-0 rounded" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{card.player ?? 'Carte'}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{cardMeta(card)}{card.price != null ? ` · ${formatEuro(card.price)}` : ''}</p>
          </div>
          {sold && <span className="text-[11px] font-medium text-[var(--green)]">Vendue</span>}
          <span className="tabular shrink-0 whitespace-nowrap text-right text-[13px] text-[var(--text-secondary)]">{count} {unit}{count > 1 ? 's' : ''}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bilan d'une journée de salon : ventes, entonnoir des visiteurs, affluence, cartes qui attirent. */
export function SalonStats() {
  const [day, setDay] = useState(localDay);
  const today = localDay();
  const { data, isLoading, error } = useSalonStats(day, day === today);
  const resetStats = useResetStats();

  async function reset(undo: boolean) {
    if (!undo && !(await confirmDialog({
      title: 'Remettre le bilan à zéro ?',
      description: "Le bilan d'aujourd'hui repartira de maintenant. Rien n'est supprimé (ventes, paniers) et tu pourras annuler.",
      confirmLabel: 'Remettre à zéro',
    }))) return;
    resetStats.mutate(undo, {
      onSuccess: () => toast.success(undo ? 'Bilan complet de la journée rétabli' : 'Bilan remis à zéro'),
      onError: (e) => toast.error('Action impossible', { description: errorMessage(e) }),
    });
  }

  const s = data?.sales;
  const steps = data?.funnel ? funnelSteps(data.funnel) : null;
  const hours = data ? hourly(data.visits_at ?? [], data.paid_at) : [];
  const peak = Math.max(1, ...hours.map((h) => Math.max(h.visits, h.sales)));
  const empty = data && !s?.carts && !data.funnel?.visitors;
  // Cartes ajoutées au panier mais pas vendues : souvent un prix à revoir.
  const notSold = (data?.top_added ?? []).filter((t) => !t.sold);

  return (
    <div className="space-y-5">
      <SalonDelist />

      <div className="flex items-center gap-2">
        <button className="ui-btn ui-btn-icon" onClick={() => setDay((d) => shiftDay(d, -1))} aria-label="Jour précédent"><ChevronLeft size={16} /></button>
        <label className="relative flex-1">
          <span className="ui-btn w-full justify-center capitalize">{dayLabel(day)}</span>
          <input type="date" className="absolute inset-0 cursor-pointer opacity-0" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Choisir le jour" />
        </label>
        <button className="ui-btn ui-btn-icon" disabled={day >= today} onClick={() => setDay((d) => shiftDay(d, 1))} aria-label="Jour suivant"><ChevronRight size={16} /></button>
      </div>

      {day === today && data && (
        <div className="-mt-2 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          {data.since ? (
            <>
              <span>Bilan depuis {new Date(data.since).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (remis à zéro)</span>
              <button className="font-medium text-[var(--accent)]" disabled={resetStats.isPending} onClick={() => void reset(true)}>Voir toute la journée</button>
            </>
          ) : (
            <>
              <span>Depuis minuit</span>
              <button className="ui-btn ui-btn-ghost ui-btn-sm" disabled={resetStats.isPending} onClick={() => void reset(false)}><RotateCcw size={13} /> Remettre à zéro</button>
            </>
          )}
        </div>
      )}

      {isLoading ? <Spinner label="Calcul du bilan…" /> : error ? (
        <Notice tone="error">Bilan indisponible : {errorMessage(error)}</Notice>
      ) : !data || !s ? null : empty ? (
        <EmptyState
          icon={Store}
          title={data.since ? 'Rien depuis la remise à zéro' : 'Aucune activité ce jour-là'}
          description={data.since ? 'Les visites et les ventes apparaîtront ici au fil du salon.' : data.tracking ? 'Ni visite ni panier sur le stand.' : 'Aucun panier ce jour-là.'}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Chiffre d'affaires" value={formatEuro(s.revenue)} icon={TrendingUp} accent hint={`${s.status.paid} panier${s.status.paid > 1 ? 's' : ''} encaissé${s.status.paid > 1 ? 's' : ''}`} />
            <StatTile label="Cartes vendues" value={s.cards_sold} icon={ShoppingBasket} hint={s.status.paid ? `${formatEuro(s.avg_cart)} par panier` : undefined} />
            <StatTile label="Offres reçues" value={s.offers} icon={HandCoins} hint={s.offers ? `${s.offers_accepted} acceptée${s.offers_accepted > 1 ? 's' : ''} · ${s.offers_refused} refusée${s.offers_refused > 1 ? 's' : ''}` : undefined} />
            <StatTile label="Remises accordées" value={formatEuro(s.discount)} hint={s.revenue ? `${pct(s.discount / (s.revenue + s.discount))} du prix affiché` : undefined} />
          </div>

          {!data.tracking && (
            <Notice tone="info" icon={Filter}>
              Pour voir les visiteurs et l'entonnoir, exécute <code>backend/add_salon_events_migration.sql</code> dans Supabase. Les ventes ci-dessus sont déjà complètes.
            </Notice>
          )}

          {steps && (
            <Panel title="Entonnoir" icon={Filter}>
              <ol className="space-y-3">
                {steps.map((st) => (
                  <li key={st.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="text-[var(--text-secondary)]">{st.label}</span>
                      <span className="tabular">
                        <strong className="text-[var(--text-primary)]">{st.count}</strong>
                        {st.fromPrev != null && <span className="ml-2 text-xs text-[var(--text-muted)]">{pct(st.fromPrev)} de l'étape d'avant</span>}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(st.share * 100, st.count ? 2 : 0)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Paniers : {s.status.paid} encaissé{s.status.paid > 1 ? 's' : ''} · {s.status.expired} expiré{s.status.expired > 1 ? 's' : ''} · {s.status.cancelled} annulé{s.status.cancelled > 1 ? 's' : ''}{s.status.active ? ` · ${s.status.active} en cours` : ''}.
                Un même visiteur sur deux téléphones compte deux fois : ce sont des ordres de grandeur.
              </p>
            </Panel>
          )}

          {hours.length > 0 && (
            <Panel title="Affluence" icon={TrendingUp}>
              <div className="flex h-36 items-end gap-1">
                {hours.map((h) => (
                  <div key={h.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${h.hour} h : ${h.visits} visiteur${h.visits > 1 ? 's' : ''}, ${h.sales} vente${h.sales > 1 ? 's' : ''}`}>
                    <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                      <div className="w-1/2 max-w-3 rounded-t bg-[var(--accent)] opacity-40" style={{ height: `${(h.visits / peak) * 100}%` }} />
                      <div className="w-1/2 max-w-3 rounded-t bg-[var(--green)]" style={{ height: `${(h.sales / peak) * 100}%` }} />
                    </div>
                    <span className="tabular text-[10px] text-[var(--text-muted)]">{h.hour}h</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-4 text-xs text-[var(--text-muted)]">
                {data.tracking && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--accent)] opacity-40" /> Visiteurs</span>}
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--green)]" /> Ventes</span>
              </div>
            </Panel>
          )}

          {data.tracking && ((data.searches_empty?.length ?? 0) > 0 || (data.searches?.length ?? 0) > 0) && (
            <Panel title="Ce que les visiteurs cherchent" icon={Search}>
              {(data.searches_empty?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Sans résultat <span className="font-normal text-[var(--text-muted)]">: des idées pour ton prochain stock</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.searches_empty!.map((q) => <span key={q.query} className="ui-chip" data-active="true">{q.query}<span className="count">{q.count}</span></span>)}
                  </div>
                </div>
              )}
              {(data.searches?.length ?? 0) > 0 && (
                <div className={`space-y-2 ${(data.searches_empty?.length ?? 0) > 0 ? 'mt-4' : ''}`}>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Les plus recherchés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.searches!.map((q) => <span key={q.query} className="ui-chip">{q.query}<span className="count">{q.count}</span></span>)}
                  </div>
                </div>
              )}
            </Panel>
          )}

          {data.tracking && (
            <>
              <Panel title="Les plus regardées" icon={Eye}>
                <TopList items={data.top_viewed ?? []} unit="visiteur" empty="Aucune fiche ouverte." />
              </Panel>
              <Panel title="Ajoutées au panier mais pas vendues" icon={ShoppingBasket}>
                <p className="-mt-1 mb-1 text-xs text-[var(--text-muted)]">Elles intéressent mais ne partent pas : prix à revoir ?</p>
                <TopList items={notSold} unit="panier" empty="Tout ce qui a été mis au panier est parti." />
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
