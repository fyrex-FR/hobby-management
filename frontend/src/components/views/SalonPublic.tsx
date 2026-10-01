import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageOff, Minus, Plus, Search, ShoppingBasket, X } from 'lucide-react';
import { cdnImg } from '../../lib/cdn';
import { cartUrl, formatEuro, useQrDataUrl, type PublicCart } from '../../lib/salon';
import type { Card } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
interface Stock { title: string | null; paypal_me: string | null; hold_minutes: number; cards: Card[]; reserved: string[] }
interface Live { reserved: string[]; sold: string[] }
interface Done { code: string; total: number; expires_at: string }

const PAGE = 24;
const PRICES = [10, 25, 50, 100];
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const metaOf = (c: Card) => [c.year, c.set_name || c.brand, c.insert_name, c.parallel_name && c.parallel_name !== 'Base' ? c.parallel_name : null].filter(Boolean).join(' · ');
const isAuto = (c: Card) => /auto/i.test(c.card_type ?? '');
const isPatch = (c: Card) => /patch|relic|jersey/i.test(c.card_type ?? '');

const LINE_LABEL = { none: '', offered: 'Offre en attente', accepted: 'Offre acceptée', countered: 'Contre-offre', refused: 'Offre refusée' } as const;

/** Page publique du stand : /salon/:token. Sans compte ; le panier vit dans le navigateur. */
export function SalonPublic({ token }: { token: string }) {
  const storeKey = `cv-salon-cart-${token}`;
  const [stock, setStock] = useState<Stock | null>(null);
  const [live, setLive] = useState<Live>({ reserved: [], sold: [] });
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'asc' | 'desc'>('recent');
  const [maxPrice, setMaxPrice] = useState(0);
  const [setName, setSetName] = useState('');
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<Card | null>(null);
  const [back, setBack] = useState(false);
  const [cart, setCart] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) ?? '[]'); } catch { return []; }
  });
  const [offers, setOffers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(() => {
    try { return JSON.parse(localStorage.getItem(`${storeKey}-done`) ?? 'null'); } catch { return null; }
  });
  const [status, setStatus] = useState<PublicCart | null>(null);

  const loadStock = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/salon/${token}/stock`);
      if (!r.ok) throw new Error(r.status === 404 ? 'Ce stand est fermé ou introuvable.' : 'Chargement impossible.');
      const d: Stock = await r.json();
      setStock(d);
      setLive((l) => ({ ...l, reserved: d.reserved }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  const loadLive = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/salon/${token}/live`);
      if (r.ok) setLive(await r.json());
    } catch { /* réseau instable : on réessaie au prochain tour */ }
  }, [token]);

  useEffect(() => { void loadStock(); }, [loadStock]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void loadLive(); }, 10000);
    return () => window.clearInterval(id);
  }, [loadLive]);

  useEffect(() => {
    if (!done) return;
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/salon/${token}/carts/${done.code}`);
        if (r.ok) setStatus(await r.json());
      } catch { /* réessai au prochain tour */ }
    };
    void poll();
    const id = window.setInterval(() => { if (!document.hidden) void poll(); }, 5000);
    return () => window.clearInterval(id);
  }, [done, token]);

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(cart)); } catch { /* stockage indisponible */ }
  }, [cart, storeKey]);

  const reserved = useMemo(() => new Set(live.reserved), [live]);
  const sold = useMemo(() => new Set(live.sold), [live]);
  const available = useMemo(() => (stock?.cards ?? []).filter((c) => !sold.has(c.id)), [stock, sold]);
  const byId = useMemo(() => new Map(available.map((c) => [c.id, c])), [available]);
  const mine = useMemo(() => cart.map((id) => byId.get(id)).filter((c): c is Card => !!c), [cart, byId]);
  const offerOf = (id: string) => {
    const v = Number(offers[id]?.replace(',', '.'));
    const asked = byId.get(id)?.price ?? 0;
    return v > 0 && v < asked ? v : null;
  };
  const total = mine.reduce((s, c) => s + (c.price ?? 0), 0);
  const sets = useMemo(() => [...new Set(available.map((c) => c.set_name).filter((x): x is string => !!x))].sort(), [available]);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    const list = available.filter((c) =>
      (!n || norm([c.player, c.team, c.year, c.brand, c.set_name, c.insert_name, c.parallel_name, c.card_number].filter(Boolean).join(' ')).includes(n))
      && (!maxPrice || (c.price ?? 0) <= maxPrice)
      && (!setName || c.set_name === setName)
      && (!flags.auto || isAuto(c)) && (!flags.patch || isPatch(c)) && (!flags.num || !!c.numbered) && (!flags.rc || !!c.is_rookie));
    if (sort === 'asc') list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (sort === 'desc') list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    return list;
  }, [available, q, maxPrice, setName, flags, sort]);

  const toggle = (id: string) => setCart((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const flag = (k: string) => { setFlags((f) => ({ ...f, [k]: !f[k] })); setLimit(PAGE); };

  async function validate() {
    setSending(true);
    setNotice(null);
    const sent: Record<string, number> = {};
    for (const c of mine) { const o = offerOf(c.id); if (o) sent[c.id] = o; }
    try {
      const r = await fetch(`${API_BASE}/api/salon/${token}/carts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: mine.map((c) => c.id), pseudo: pseudo.trim() || null, offers: sent }),
      });
      if (r.status === 409) {
        const gone: string[] = (await r.json()).detail?.unavailable ?? [];
        setCart((c) => c.filter((id) => !gone.includes(id)));
        setNotice(`${gone.length > 1 ? 'Des cartes viennent' : 'Une carte vient'} d'être prise : ${gone.length > 1 ? 'retirées' : 'retirée'} de ton panier.`);
        void loadLive();
        return;
      }
      if (!r.ok) throw new Error();
      const d: Done = await r.json();
      try { localStorage.setItem(`${storeKey}-done`, JSON.stringify(d)); } catch { /* stockage indisponible */ }
      setStatus(null);
      setDone(d);
      setCart([]);
      setOffers({});
      setOpen(false);
      void loadLive();
    } catch {
      setNotice('Envoi impossible, réessaie dans un instant.');
    } finally {
      setSending(false);
    }
  }

  const qr = useQrDataUrl(done ? cartUrl(done.code) : null);

  if (error && !stock) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-[var(--text-secondary)]">{error}</div>;
  if (!stock) return <div className="flex min-h-screen items-center justify-center text-[var(--text-secondary)]">Chargement…</div>;

  if (done) {
    const cur = status?.total ?? done.total;
    const closed = status?.status === 'paid' || status?.status === 'expired' || status?.status === 'cancelled';
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-sm text-[var(--text-secondary)]">
          {status?.status === 'paid' ? 'Merci, c\'est réglé !' : status?.status === 'expired' ? 'Panier expiré' : status?.status === 'cancelled' ? 'Panier annulé' : 'Ton panier est prêt'}
        </div>
        <div className="font-mono text-6xl font-bold tracking-[0.2em] text-[var(--text-primary)]">{done.code}</div>
        {!closed && qr && <img src={qr} alt={`QR du panier ${done.code}`} className="w-64 rounded-xl bg-white p-2" />}
        {status && status.lines.length > 0 && (
          <ul className="w-full divide-y divide-[var(--border)] text-left text-sm">
            {status.lines.map((l) => (
              <li key={l.card_id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="block truncate">{l.player ?? 'Carte'}</span>
                  {l.state !== 'none' && <span className="block text-xs text-[var(--text-secondary)]">{LINE_LABEL[l.state]}{l.state === 'offered' || l.state === 'refused' ? ` · ${formatEuro(l.offer ?? 0)}` : ''}</span>}
                </span>
                <span className="text-right font-medium">{l.final !== l.asked && <s className="mr-1 text-xs text-[var(--text-muted)]">{formatEuro(l.asked)}</s>}{formatEuro(l.final)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="text-lg font-semibold">{formatEuro(cur)}</div>
        {!closed && stock.paypal_me && (
          <a className="ui-btn" href={`https://www.paypal.me/${stock.paypal_me}/${cur}EUR`} target="_blank" rel="noreferrer">Payer via PayPal</a>
        )}
        {!closed && <p className="text-sm text-[var(--text-secondary)]">Montre ce code ou ce QR au vendeur pour régler. Cette page se met à jour quand le vendeur répond à tes offres. Cartes réservées {stock.hold_minutes} min.</p>}
        <button className="ui-btn" onClick={() => { setDone(null); setStatus(null); try { localStorage.removeItem(`${storeKey}-done`); } catch { /* stockage indisponible */ } }}>{closed ? 'Retour au stand' : 'Nouveau panier'}</button>
      </div>
    );
  }

  const chip = (k: string, label: string) => (
    <button key={k} className={`ui-btn h-8 shrink-0 px-3 text-xs ${flags[k] ? 'ui-btn-primary' : ''}`} aria-pressed={!!flags[k]} onClick={() => flag(k)}>{label}</button>
  );

  return (
    <div className="mx-auto max-w-5xl px-3 pb-28">
      <header className="sticky top-0 z-10 -mx-3 mb-3 border-b border-[var(--border)] bg-[var(--bg-primary)] px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="truncate text-lg font-semibold">{stock.title || 'Cartes à vendre'}</h1>
          <button className="ui-btn ui-btn-primary relative h-9 shrink-0 px-3" onClick={() => setOpen(true)} aria-label="Mon panier">
            <ShoppingBasket size={18} />{mine.length > 0 && <span className="ml-1.5 text-sm font-semibold">{mine.length}</span>}
          </button>
        </div>
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input className="ui-input w-full pl-9" placeholder="Joueur, équipe, set, année…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        </label>
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1">
          {chip('auto', 'Auto')}{chip('patch', 'Patch')}{chip('num', 'Numérotée')}{chip('rc', 'Rookie')}
          <select className="ui-input h-8 shrink-0 py-0 text-xs" aria-label="Prix max" value={maxPrice} onChange={(e) => { setMaxPrice(Number(e.target.value)); setLimit(PAGE); }}>
            <option value={0}>Tous prix</option>{PRICES.map((p) => <option key={p} value={p}>≤ {p} €</option>)}
          </select>
          <select className="ui-input h-8 max-w-[10rem] shrink-0 py-0 text-xs" aria-label="Set" value={setName} onChange={(e) => { setSetName(e.target.value); setLimit(PAGE); }}>
            <option value="">Tous les sets</option>{sets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="ui-input h-8 shrink-0 py-0 text-xs" aria-label="Tri" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="recent">Récentes</option><option value="asc">Prix ↑</option><option value="desc">Prix ↓</option>
          </select>
        </div>
      </header>
      {notice && <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm">{notice}</div>}
      <div className="mb-2 text-xs text-[var(--text-secondary)]">{shown.length} carte{shown.length > 1 ? 's' : ''}</div>
      {!shown.length && <div className="py-10 text-center text-[var(--text-secondary)]">Aucune carte.</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {shown.slice(0, limit).map((c) => {
          const taken = reserved.has(c.id);
          const inCart = cart.includes(c.id);
          return (
            <div key={c.id} className={`flex flex-col overflow-hidden rounded-xl border bg-[var(--bg-card)] ${inCart ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)]'} ${taken ? 'opacity-50' : ''}`}>
              <button className="aspect-[3/4] bg-[var(--bg-secondary)]" onClick={() => { setDetail(c); setBack(false); }} aria-label={`Voir ${c.player ?? 'la carte'}`}>
                {c.image_front_url
                  ? <img src={cdnImg(c.image_front_url)} alt={c.player ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center text-[var(--text-muted)]"><ImageOff size={24} /></div>}
              </button>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <div className="truncate text-sm font-semibold">{c.player ?? 'Carte'}</div>
                <div className="line-clamp-2 text-xs text-[var(--text-secondary)]">{metaOf(c)}</div>
                <div className="mt-auto flex items-center justify-between pt-1.5">
                  <span className="font-semibold">{formatEuro(c.price ?? 0)}</span>
                  {taken
                    ? <span className="text-xs text-[var(--text-muted)]">Réservée</span>
                    : <button className="ui-btn ui-btn-primary h-9 px-3" aria-pressed={inCart} aria-label={inCart ? 'Retirer du panier' : 'Ajouter au panier'} onClick={() => toggle(c.id)}>{inCart ? <Minus size={16} /> : <Plus size={16} />}</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {shown.length > limit && <button className="ui-btn mx-auto mt-4 flex" onClick={() => setLimit((l) => l + PAGE)}>Voir plus ({shown.length - limit})</button>}

      {mine.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg-card)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button className="ui-btn ui-btn-primary mx-auto flex w-full max-w-md items-center justify-center gap-2" onClick={() => setOpen(true)}>
            <ShoppingBasket size={18} /> Panier · {mine.length} carte{mine.length > 1 ? 's' : ''} · {formatEuro(total)}
          </button>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/60 sm:items-center sm:justify-center" onClick={() => setDetail(null)}>
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--bg-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div><div className="text-lg font-semibold">{detail.player ?? 'Carte'}</div><div className="text-sm text-[var(--text-secondary)]">{metaOf(detail)}{detail.card_number ? ` · #${detail.card_number}` : ''}</div></div>
              <button className="ui-btn h-8 px-2" onClick={() => setDetail(null)} aria-label="Fermer"><X size={16} /></button>
            </div>
            <div className="mx-auto aspect-[3/4] max-h-[55vh] overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
              {(back && detail.image_back_url ? detail.image_back_url : detail.image_front_url)
                ? <img src={cdnImg((back && detail.image_back_url ? detail.image_back_url : detail.image_front_url) as string)} alt="" className="h-full w-full object-contain" />
                : <div className="flex h-full items-center justify-center text-[var(--text-muted)]"><ImageOff size={32} /></div>}
            </div>
            {detail.image_back_url && <button className="ui-btn mx-auto mt-2 flex h-8 text-xs" onClick={() => setBack((b) => !b)}>{back ? 'Voir le recto' : 'Voir le verso'}</button>}
            {detail.condition_notes && <p className="mt-2 text-sm text-[var(--text-secondary)]">{detail.condition_notes}</p>}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xl font-semibold">{formatEuro(detail.price ?? 0)}</span>
              {reserved.has(detail.id)
                ? <span className="text-sm text-[var(--text-muted)]">Réservée</span>
                : <button className="ui-btn ui-btn-primary" onClick={() => toggle(detail.id)}>{cart.includes(detail.id) ? 'Retirer du panier' : 'Ajouter au panier'}</button>}
            </div>
            {!reserved.has(detail.id) && (
              <button className="ui-btn mt-2 w-full" onClick={() => { if (!cart.includes(detail.id)) toggle(detail.id); setDetail(null); setOpen(true); }}>Faire une offre</button>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--bg-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-semibold">Mon panier</div>
            {!mine.length && <div className="py-4 text-center text-sm text-[var(--text-secondary)]">Panier vide.</div>}
            <ul className="divide-y divide-[var(--border)]">
              {mine.map((c) => {
                const o = offerOf(c.id);
                return (
                  <li key={c.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">{c.player ?? 'Carte'} <span className="text-[var(--text-secondary)]">{[c.year, c.set_name].filter(Boolean).join(' ')}</span></span>
                      <span className="flex items-center gap-2 font-medium">{o ? <><s className="text-xs text-[var(--text-muted)]">{formatEuro(c.price ?? 0)}</s>{formatEuro(o)}</> : formatEuro(c.price ?? 0)}<button className="ui-btn h-8 px-2" onClick={() => toggle(c.id)} aria-label="Retirer"><Minus size={14} /></button></span>
                    </div>
                    <input className="ui-input mt-1.5 h-8 w-full text-xs" inputMode="decimal" placeholder={`Ton offre en € (moins de ${c.price ?? 0})`} value={offers[c.id] ?? ''} onChange={(e) => setOffers((m) => ({ ...m, [c.id]: e.target.value }))} />
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between text-base font-semibold"><span>Total</span><span>{formatEuro(total)}</span></div>
            <p className="text-xs text-[var(--text-secondary)]">Le total reste au prix demandé tant que le vendeur n'a pas répondu à tes offres.</p>
            <input className="ui-input mt-3 w-full" placeholder="Ton prénom (facultatif)" value={pseudo} maxLength={60} onChange={(e) => setPseudo(e.target.value)} />
            {notice && <div className="mt-2 text-sm text-[var(--orange)]">{notice}</div>}
            <button className="ui-btn ui-btn-primary mt-3 w-full" disabled={sending || !mine.length} onClick={() => void validate()}>{sending ? 'Envoi…' : 'Valider mon panier'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
