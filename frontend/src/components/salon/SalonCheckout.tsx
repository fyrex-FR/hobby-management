import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search, ShoppingBasket, X } from 'lucide-react';
import { Panel, Spinner } from '../ui';
import { errorMessage, toast } from '../../lib/feedback';
import { buildFilterContext, emptyFilters, filterCards, sortCards } from '../../lib/collectionFilters';
import { formatEuro, marketMessage, parseAmount, salonApi, useCheckout, type SalonCart } from '../../lib/salon';
import type { Card } from '../../types';
import { Thumb } from './parts';
import { cardMeta, cardVariant } from './cardText';

const MAX_RESULTS = 20;

/**
 * Caisse rapide : pour l'acheteur qui ne scanne pas le QR. Le vendeur
 * cherche les cartes, ajuste un prix ou fixe un prix de lot, encaisse.
 * La vente compte dans le bilan comme un panier encaissé.
 */
export function SalonCheckout({ token, carts }: { token: string; carts: SalonCart[] }) {
  const api = useMemo(() => salonApi(token), [token]);
  const { data: stock, isLoading } = useQuery({ queryKey: ['salon-stock', token], queryFn: api.stock, refetchInterval: 15000 });
  const checkout = useCheckout();
  const [q, setQ] = useState('');
  const [ticket, setTicket] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [lot, setLot] = useState('');

  const cards = useMemo(() => stock?.cards ?? [], [stock]);
  const ctx = useMemo(() => buildFilterContext(cards), [cards]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  // Carte bloquée par un panier visiteur en cours (le serveur écarte les expirés) : on affiche son code.
  const reservedBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const id of stock?.reserved ?? []) m.set(id, carts.find((c) => c.status === 'active' && c.card_ids.includes(id))?.code ?? '—');
    return m;
  }, [stock, carts]);

  const results = useMemo(() => {
    const list = q.trim() ? filterCards(cards, { ...emptyFilters(), search: q }, ctx) : sortCards(cards, 'recent');
    return list.filter((c) => !ticket.includes(c.id));
  }, [cards, ctx, q, ticket]);

  const lines = ticket.map((id) => byId.get(id)).filter((c): c is Card => !!c);
  const finalOf = (c: Card) => parseAmount(prices[c.id] ?? '') ?? c.price ?? 0;
  const listed = lines.reduce((s, c) => s + (c.price ?? 0), 0);
  const sum = lines.reduce((s, c) => s + finalOf(c), 0);
  const lotValue = parseAmount(lot);
  const total = Math.round((lotValue ?? sum) * 100) / 100;

  const add = (id: string) => { setTicket((t) => [...t, id]); setQ(''); };
  const remove = (id: string) => setTicket((t) => t.filter((x) => x !== id));
  const reset = () => { setTicket([]); setPrices({}); setLot(''); };

  function pay() {
    const overridden: Record<string, number> = {};
    for (const c of lines) {
      const v = parseAmount(prices[c.id] ?? '');
      if (v != null && v !== c.price) overridden[c.id] = v;
    }
    checkout.mutate({ card_ids: lines.map((c) => c.id), prices: overridden, total: lotValue }, {
      onSuccess: (res) => {
        const market = marketMessage(res.marketplaces);
        toast.success(`Vendu · ${formatEuro(res.total)}`, market ? { description: market.text } : undefined);
        reset();
      },
      onError: (e) => toast.error('Vente impossible', { description: errorMessage(e) }),
    });
  }

  if (isLoading) return <Spinner label="Chargement du stock…" />;

  return (
    <div className="space-y-4">
      {lines.length > 0 && (
        <Panel
          title={`Vente en cours · ${lines.length} carte${lines.length > 1 ? 's' : ''}`}
          icon={ShoppingBasket}
          action={<button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={reset}>Vider</button>}
        >
          <ul className="-mt-1 divide-y divide-[var(--border)]">
            {lines.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <Thumb url={c.image_front_url} className="h-12 w-9 shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{c.player ?? 'Carte'}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{cardMeta(c)}</p>
                </div>
                <input
                  className="ui-input tabular h-8 w-20 text-right"
                  inputMode="decimal"
                  aria-label={`Prix de ${c.player ?? 'la carte'}`}
                  placeholder={String(c.price ?? '')}
                  value={prices[c.id] ?? ''}
                  disabled={lotValue != null}
                  onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value }))}
                />
                <button className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8" onClick={() => remove(c.id)} aria-label="Retirer"><X size={15} /></button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <span className="shrink-0 text-xs text-[var(--text-muted)]">Prix du lot</span>
            <input className="ui-input tabular h-9 flex-1" inputMode="decimal" placeholder={`facultatif (affiché ${formatEuro(listed)})`} value={lot} onChange={(e) => setLot(e.target.value)} />
          </div>
          <button className="ui-btn ui-btn-primary ui-btn-lg mt-3 w-full" disabled={checkout.isPending || !lines.length || total <= 0} onClick={pay}>
            <Check size={16} /> Encaisser {formatEuro(total)}
            {total < listed && <span className="font-normal opacity-75">(−{formatEuro(Math.round((listed - total) * 100) / 100)})</span>}
          </button>
        </Panel>
      )}

      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          className="ui-input h-11 pl-9 text-[15px]"
          type="search"
          autoFocus
          placeholder="Chercher une carte : joueur, set, numéro…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          {q.trim() ? `${results.length} résultat${results.length > 1 ? 's' : ''}` : 'Dernières cartes mises en vente'}
        </p>
        {!results.length ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">Aucune carte à vendre ne correspond.</p>
        ) : (
          <ul className="space-y-1.5">
            {results.slice(0, MAX_RESULTS).map((c) => {
              const code = reservedBy.get(c.id);
              const variant = cardVariant(c);
              return (
                <li key={c.id}>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 text-left transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                    disabled={!!code}
                    onClick={() => add(c.id)}
                  >
                    <Thumb url={c.image_front_url} className="h-14 w-10 shrink-0 rounded" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{c.player ?? 'Carte'}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">{[cardMeta(c), variant].filter(Boolean).join(' · ')}</span>
                    </span>
                    {code
                      ? <span className="shrink-0 text-xs text-[var(--text-muted)]">Réservée · <span className="font-mono">{code}</span></span>
                      : <span className="flex shrink-0 items-center gap-2"><span className="tabular text-[13px] font-semibold">{formatEuro(c.price ?? 0)}</span><Plus size={16} className="text-[var(--accent)]" /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {results.length > MAX_RESULTS && <p className="mt-2 text-center text-xs text-[var(--text-muted)]">Affine la recherche pour voir les {results.length - MAX_RESULTS} autres.</p>}
      </div>
    </div>
  );
}
