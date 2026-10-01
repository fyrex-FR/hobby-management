import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, HandCoins, Plus, Search, ShoppingBasket, SlidersHorizontal, Store, X } from 'lucide-react';
import { ThemeToggleButton } from '../ui';
import { confirmDialog, toast } from '../../lib/feedback';
import { buildFilterContext } from '../../lib/collectionFilters';
import {
  SalonError, formatEuro, salonApi,
  type PublicCart, type SalonLive, type SalonStock, type SalonTicket as Ticket,
} from '../../lib/salon';
import { createTracker, isOwner, visitorId } from '../../lib/salonTracker';
import type { Card } from '../../types';
import { CardTags, ScrollRow, Thumb } from '../salon/parts';
import { cardMeta, cardVariant } from '../salon/cardText';
import {
  SALON_FACETS, SALON_FLAGS, SALON_SORTS, activeCount, clearFilters, computeSalon, emptySalonFilters,
  setSport, toggleFacet, toggleFlag, type SalonFilterState, type SalonSort,
} from '../salon/salonFilters';
import { SalonFilterSheet } from '../salon/SalonFilterSheet';
import { SalonCardSheet } from '../salon/SalonCardSheet';
import { SalonCartSheet } from '../salon/SalonCartSheet';
import { SalonTicket } from '../salon/SalonTicket';

const PAGE = 30;

function load<T>(storage: () => Storage, key: string, fallback: T): T {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value == null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch { /* stockage indisponible (navigation privée) */ }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* pas de vibreur */ } };

function Tile({ card, inCart, taken, onOpen, onToggle }: { card: Card; inCart: boolean; taken: boolean; onOpen: () => void; onToggle: () => void }) {
  const variant = cardVariant(card);
  return (
    <div className={`relative flex flex-col overflow-hidden rounded-xl border bg-[var(--bg-card)] transition-[border-color,opacity] ${inCart ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)]'} ${taken ? 'opacity-55' : ''}`}>
      <button className="relative block aspect-[3/4] w-full" onClick={onOpen} aria-label={`Voir ${card.player ?? 'la carte'}`}>
        <Thumb url={card.image_front_url} alt={card.player ?? ''} className="absolute inset-0" />
        <span className="absolute left-2 top-2 flex max-w-[85%] flex-wrap gap-1"><CardTags card={card} /></span>
        {taken && <span className="dark-scope absolute inset-x-0 bottom-0 bg-black/70 py-1.5 text-center text-xs font-semibold text-white">Réservée</span>}
      </button>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{card.player ?? 'Carte'}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">{cardMeta(card) || '—'}</p>
        {variant && <p className="truncate text-xs text-[var(--text-secondary)]">{variant}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="tabular min-w-0 truncate text-[15px] font-semibold text-[var(--price)]">{formatEuro(card.price ?? 0)}</span>
          {!taken && (
            <button
              className={`ui-btn ui-btn-sm h-9 ${inCart ? '' : 'ui-btn-primary'}`}
              aria-pressed={inCart}
              aria-label={inCart ? 'Retirer du panier' : 'Ajouter au panier'}
              onClick={onToggle}
            >
              {inCart ? <Check size={15} /> : <Plus size={15} />}
              <span>{inCart ? 'Ajoutée' : 'Ajouter'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Page publique du stand (/salon/:token), sans compte.
 *
 * Parcours : chercher / filtrer → ajouter d'un tap → « Réserver » (avec ou
 * sans offre sur le lot) → code + QR à montrer au stand. La réservation reste
 * modifiable (ajouter, retirer, nouvelle offre) sans changer de code.
 */
export function SalonPublic({ token }: { token: string }) {
  const api = useMemo(() => salonApi(token), [token]);
  const K = useMemo(() => ({ cart: `cv-salon-${token}-cart`, ticket: `cv-salon-${token}-ticket`, filters: `cv-salon-${token}-filters` }), [token]);

  const [stock, setStock] = useState<SalonStock | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<SalonLive>({ reserved: [], sold: [] });
  const [cart, setCart] = useState<string[]>(() => load(local, K.cart, load(local, `cv-salon-cart-${token}`, [] as string[])));
  const [ticket, setTicket] = useState<Ticket | null>(() => load(local, K.ticket, null));
  const [pub, setPub] = useState<PublicCart | null>(null);
  const [screen, setScreen] = useState<'browse' | 'ticket'>(() => (load<Ticket | null>(local, K.ticket, null) ? 'ticket' : 'browse'));
  const [fs, setFs] = useState<SalonFilterState>(() => {
    const saved = load<SalonFilterState | null>(session, K.filters, null);
    return saved ? { ...emptySalonFilters(), ...saved } : emptySalonFilters();
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replied, setReplied] = useState(false);
  const lastOfferState = useRef<string | null>(null);
  const owner = useMemo(() => isOwner(token), [token]);
  const tracker = useMemo(() => createTracker(token, { disabled: owner }), [token, owner]);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => save(local, K.cart, cart), [K, cart]);
  useEffect(() => save(local, K.ticket, ticket), [K, ticket]);
  useEffect(() => save(session, K.filters, fs), [K, fs]);

  /* ── Données ─────────────────────────────────────────────── */

  useEffect(() => {
    api.stock().then(
      (d) => { setStock(d); setLive((l) => ({ ...l, reserved: d.reserved })); },
      (e) => setLoadError(e instanceof SalonError && e.status === 404 ? 'Ce stand est fermé pour le moment.' : 'Impossible de charger le stand. Vérifie ta connexion.'),
    );
  }, [api]);

  const refreshLive = useCallback(() => { api.live().then(setLive, () => { /* réessai au prochain tour */ }); }, [api]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) refreshLive(); }, 10000);
    return () => window.clearInterval(id);
  }, [refreshLive]);

  const refreshPub = useCallback((t: Ticket | null = ticket) => {
    if (!t) return;
    api.cart(t).then(setPub, (e) => {
      // Réservation effacée côté serveur : on oublie le ticket.
      if (e instanceof SalonError && e.status === 404) { setTicket(null); setPub(null); setScreen('browse'); }
    });
  }, [api, ticket]);
  useEffect(() => {
    if (!ticket) return;
    refreshPub();
    const id = window.setInterval(() => { if (!document.hidden) refreshPub(); }, screen === 'ticket' ? 5000 : 12000);
    return () => window.clearInterval(id);
  }, [ticket, screen, refreshPub]);

  // Audience anonyme pour le bilan du vendeur ; envoi immédiat quand la page passe en arrière-plan.
  useEffect(() => {
    tracker.track('visit');
    const onHide = () => { if (document.hidden) tracker.flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', tracker.flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', tracker.flush);
      tracker.flush();
    };
  }, [tracker]);

  // Retour sur la page (téléphone déverrouillé, onglet repris) : on rafraîchit tout de suite.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) { refreshLive(); refreshPub(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshLive, refreshPub]);

  // Le vendeur répond pendant que le visiteur parcourt le stand : on le prévient.
  useEffect(() => {
    const st = pub?.offer_state ?? null;
    if (lastOfferState.current === 'offered' && st && st !== 'offered' && screen === 'browse') setReplied(true);
    lastOfferState.current = st;
    if (pub?.status === 'paid') setScreen('ticket');
  }, [pub, screen]);

  /* ── Dérivés ─────────────────────────────────────────────── */

  const reservation = ticket && pub && (pub.status === 'active' || pub.status === 'expired') ? pub : null;
  const mineReserved = useMemo(() => new Set(reservation?.status === 'active' ? reservation.card_ids : []), [reservation]);
  const sold = useMemo(() => new Set(live.sold), [live]);
  const unavailable = useMemo(() => new Set(live.reserved.filter((id) => !mineReserved.has(id))), [live, mineReserved]);
  const forSale = useMemo(() => (stock?.cards ?? []).filter((c) => !sold.has(c.id)), [stock, sold]);
  const byId = useMemo(() => new Map(forSale.map((c) => [c.id, c])), [forSale]);
  const ctx = useMemo(() => buildFilterContext(forSale), [forSale]);
  const data = useMemo(() => computeSalon(forSale, fs, ctx, unavailable), [forSale, fs, ctx, unavailable]);

  const cartCards = cart.map((id) => byId.get(id)).filter((c): c is Card => !!c && !unavailable.has(c.id));
  const blocked = cart.map((id) => byId.get(id)).filter((c): c is Card => !!c && unavailable.has(c.id));
  const cartTotal = cartCards.reduce((s, c) => s + (c.price ?? 0), 0);
  const dirty = !!reservation && !sameSet(cartCards.map((c) => c.id), reservation.card_ids);
  const filterCount = activeCount(fs);
  // Accord déjà trouvé et toutes ses cartes gardées : on le reprend comme offre.
  const keptDeal = reservation && dirty && reservation.total < reservation.asked && reservation.card_ids.every((id) => cart.includes(id))
    ? Math.round((reservation.total + cartCards.filter((c) => !reservation.card_ids.includes(c.id)).reduce((s, c) => s + (c.price ?? 0), 0)) * 100) / 100
    : null;
  const sportOptions = data.sports;
  const sport = fs.filters.facets.sport[0] ?? null;

  useEffect(() => { setLimit(PAGE); }, [fs]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) setLimit((l) => l + PAGE); }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [screen, stock]);

  /* ── Actions ─────────────────────────────────────────────── */

  const toggle = (id: string) => {
    buzz();
    if (!cart.includes(id)) tracker.track('add', id);
    setCart((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  };
  const openDetail = (i: number) => {
    const c = data.shown[i];
    if (c) tracker.track('view', c.id);
    setDetail(i);
  };
  const update = (next: SalonFilterState) => setFs(next);

  async function submit({ offer, pseudo }: { offer: number | null; pseudo: string }) {
    const ids = cartCards.map((c) => c.id);
    setSending(true);
    setSendError(null);
    try {
      const body = { card_ids: ids, offer, pseudo: pseudo || null, visitor: owner ? null : visitorId() };
      const res = reservation && ticket ? await api.update(ticket, body) : await api.create(body);
      const next = { code: res.code, key: res.key ?? ticket?.key ?? '' };
      setTicket(next);
      setCart(ids);
      setPub(null);
      lastOfferState.current = null;
      setCartOpen(false);
      setScreen('ticket');
      refreshLive();
      refreshPub(next);
    } catch (e) {
      if (e instanceof SalonError && e.unavailable.length) {
        refreshLive();
        setCart((c) => c.filter((id) => !e.unavailable.includes(id)));
        setSendError(e.unavailable.length > 1
          ? `${e.unavailable.length} cartes viennent d'être prises par quelqu'un d'autre : retirées de ton panier.`
          : 'Une carte vient d\'être prise par quelqu\'un d\'autre : retirée de ton panier.');
      } else if (e instanceof SalonError && (e.status === 409 || e.status === 403 || e.status === 404)) {
        setTicket(null);
        setPub(null);
        setSendError('Ta réservation précédente n\'existe plus. Valide à nouveau pour en créer une.');
      } else {
        setSendError('Envoi impossible. Vérifie ta connexion et réessaie.');
      }
    } finally {
      setSending(false);
    }
  }

  async function cancelReservation() {
    if (!ticket) return;
    const ok = await confirmDialog({ title: 'Annuler la réservation ?', description: 'Les cartes seront remises en vente pour les autres visiteurs.', confirmLabel: 'Annuler la réservation', cancelLabel: 'Garder', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await api.cancel(ticket);
      setTicket(null); setPub(null); setCart([]); setScreen('browse');
      refreshLive();
      toast('Réservation annulée');
    } catch {
      toast.error('Annulation impossible', { description: 'Réessaie dans un instant.' });
    } finally {
      setBusy(false);
    }
  }

  async function acceptCounter() {
    if (!ticket) return;
    setBusy(true);
    try { await api.accept(ticket); refreshPub(); } catch { toast.error('Impossible de répondre', { description: 'Réessaie dans un instant.' }); } finally { setBusy(false); }
  }

  function editReservation() {
    if (reservation) setCart(reservation.card_ids);
    setReplied(false);
    setScreen('browse');
    if (reservation?.status === 'expired') setCartOpen(true);
  }

  function finish() {
    setTicket(null); setPub(null); setCart([]); setScreen('browse');
  }

  /* ── Écrans ──────────────────────────────────────────────── */

  if (loadError && !stock) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]"><Store size={24} /></div>
        <p className="text-[15px] font-medium text-[var(--text-primary)]">{loadError}</p>
      </div>
    );
  }

  const title = stock?.title || 'Cartes à vendre';

  if (screen === 'ticket' && ticket) {
    return (
      <SalonTicket
        ticket={ticket}
        cart={pub}
        title={title}
        paypalMe={stock?.paypal_me ?? null}
        busy={busy}
        onBrowse={() => { setReplied(false); setScreen('browse'); }}
        onEdit={editReservation}
        onCancel={() => void cancelReservation()}
        onAccept={() => void acceptCounter()}
        onDone={finish}
      />
    );
  }

  const shown = data.shown;
  const openCart = () => {
    if (reservation && !dirty) return setScreen('ticket');
    tracker.track('cart');
    setCartOpen(true);
  };

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-primary)]/90 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-6xl space-y-2.5 px-4 pb-3 sm:px-6">
          <div className="flex h-14 items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h1>
              <p className="text-xs text-[var(--text-muted)]">{stock ? `${forSale.length} cartes à vendre` : 'Chargement…'}</p>
            </div>
            <ThemeToggleButton />
            <motion.button
              key={cartCards.length}
              initial={{ scale: cartCards.length ? 0.9 : 1 }}
              animate={{ scale: 1 }}
              className="ui-btn ui-btn-primary ui-btn-sm h-9"
              onClick={openCart}
              aria-label="Mon panier"
            >
              <ShoppingBasket size={16} />
              <span className="tabular">{cartCards.length}</span>
            </motion.button>
          </div>

          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="ui-input h-10 pl-9 pr-9 text-[15px] sm:text-[13px]"
              type="search"
              enterKeyHint="search"
              placeholder="Joueur, équipe, set, année…"
              value={fs.filters.search}
              onChange={(e) => update({ ...fs, filters: { ...fs.filters, search: e.target.value } })}
            />
            {fs.filters.search && (
              <button className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)]" onClick={() => update({ ...fs, filters: { ...fs.filters, search: '' } })} aria-label="Effacer la recherche">
                <X size={15} />
              </button>
            )}
          </label>

          {sportOptions.length > 1 && (
            <div className="ui-segmented w-full overflow-x-auto [scrollbar-width:none]">
              <button data-active={!sport} onClick={() => update(setSport(fs, null))}>Tout</button>
              {sportOptions.map((o) => (
                <button key={o.value} data-active={sport === o.value} onClick={() => update(setSport(fs, sport === o.value ? null : o.value))}>
                  {o.value}<span className="count">{o.count}</span>
                </button>
              ))}
            </div>
          )}

          <ScrollRow>
            <button className="ui-chip shrink-0" data-active={filterCount > 0} onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={14} /> Filtres{filterCount > 0 && <span className="count">{filterCount}</span>}
            </button>
            <select className="ui-select h-8 w-auto shrink-0 rounded-full pl-3 text-[13px]" aria-label="Trier" value={fs.sort} onChange={(e) => update({ ...fs, sort: e.target.value as SalonSort })}>
              {SALON_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="my-1.5 w-px shrink-0 bg-[var(--border)]" />
            {SALON_FLAGS.filter((f) => data.flags[f.key] > 0 || fs.filters.flags.includes(f.key)).map((f) => (
              <button key={f.key} className="ui-chip shrink-0" data-active={fs.filters.flags.includes(f.key)} aria-pressed={fs.filters.flags.includes(f.key)} onClick={() => update(toggleFlag(fs, f.key))}>
                {f.label}<span className="count">{data.flags[f.key]}</span>
              </button>
            ))}
          </ScrollRow>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-3 sm:px-6">
        {replied && (
          <button className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-accent)] bg-[var(--accent-dim)] p-3 text-left" onClick={() => { setReplied(false); setScreen('ticket'); }}>
            <HandCoins size={18} className="shrink-0 text-[var(--accent)]" />
            <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)]">Le vendeur a répondu à ton offre</span>
            <span className="text-[13px] font-semibold text-[var(--accent)]">Voir</span>
          </button>
        )}

        {(filterCount > 0) && (
          <ScrollRow>
            {fs.budget != null && (
              <button className="ui-chip shrink-0" data-active onClick={() => update({ ...fs, budget: null })}>≤ {fs.budget} € <X size={13} /></button>
            )}
            {SALON_FACETS.flatMap(({ key }) => fs.filters.facets[key].map((v) => (
              <button key={`${key}-${v}`} className="ui-chip shrink-0" data-active onClick={() => update(toggleFacet(fs, key, v))}>{v} <X size={13} /></button>
            )))}
            {fs.filters.flags.map((f) => (
              <button key={f} className="ui-chip shrink-0" data-active onClick={() => update(toggleFlag(fs, f))}>{SALON_FLAGS.find((x) => x.key === f)?.label} <X size={13} /></button>
            ))}
            <button className="ui-chip shrink-0 border-transparent" onClick={() => update(clearFilters(fs))}>Tout effacer</button>
          </ScrollRow>
        )}

        {stock && (
          <p className="text-xs text-[var(--text-muted)]">
            <span className="tabular">{shown.length}</span> carte{shown.length > 1 ? 's' : ''}
            {shown.some((c) => unavailable.has(c.id)) && <> · <span className="tabular">{shown.filter((c) => unavailable.has(c.id)).length}</span> réservée{shown.filter((c) => unavailable.has(c.id)).length > 1 ? 's' : ''} en fin de liste</>}
          </p>
        )}

        {!stock ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[3/5] animate-pulse rounded-xl bg-[var(--bg-secondary)]" />)}
          </div>
        ) : !shown.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[15px] font-medium text-[var(--text-primary)]">Aucune carte ne correspond</p>
            <button className="ui-btn" onClick={() => update({ ...emptySalonFilters(), sort: fs.sort })}>Effacer la recherche et les filtres</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {shown.slice(0, limit).map((c, i) => (
              <Tile key={c.id} card={c} inCart={cart.includes(c.id)} taken={unavailable.has(c.id)} onOpen={() => openDetail(i)} onToggle={() => toggle(c.id)} />
            ))}
          </div>
        )}
        <div ref={sentinel} className="h-px" />
      </main>

      {(cartCards.length > 0 || reservation) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--bg-card)]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                {reservation ? `Réservation ${ticket?.code}` : `${cartCards.length} carte${cartCards.length > 1 ? 's' : ''}`}
              </p>
              <p className="tabular truncate text-xs text-[var(--text-muted)]">
                {reservation && !dirty ? `${reservation.card_ids.length} carte${reservation.card_ids.length > 1 ? 's' : ''} · ${formatEuro(reservation.total)}`
                  : reservation ? `Modifiée · ${cartCards.length} carte${cartCards.length > 1 ? 's' : ''} · ${formatEuro(cartTotal)}`
                  : formatEuro(cartTotal)}
              </p>
            </div>
            <button className="ui-btn ui-btn-primary ui-btn-lg" onClick={openCart}>
              {reservation && !dirty ? 'Voir mon code' : reservation ? 'Mettre à jour' : 'Réserver'} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      <SalonFilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} state={fs} onChange={update} data={data} />

      {detail != null && shown[detail] && (
        <SalonCardSheet
          list={shown}
          index={detail}
          onIndex={openDetail}
          onClose={() => setDetail(null)}
          inCart={(id) => cart.includes(id)}
          unavailable={(id) => unavailable.has(id)}
          onToggle={toggle}
        />
      )}

      <SalonCartSheet
        key={`${reservation?.code ?? 'new'}-${keptDeal ?? ''}`}
        keptDeal={keptDeal != null && keptDeal < cartTotal ? keptDeal : null}
        open={cartOpen}
        onClose={() => { setCartOpen(false); setSendError(null); }}
        cards={cartCards}
        blocked={blocked}
        editingCode={reservation ? ticket?.code ?? null : null}
        holdMinutes={stock?.hold_minutes ?? 30}
        sending={sending}
        error={sendError}
        onRemove={(id) => setCart((c) => c.filter((x) => x !== id))}
        onSubmit={(p) => void submit(p)}
      />
    </div>
  );
}
