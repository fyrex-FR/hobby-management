import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageOff, Minus, Plus, Search, ShoppingBasket } from 'lucide-react';
import { cdnImg } from '../../lib/cdn';
import { cartUrl, formatEuro, useQrDataUrl } from '../../lib/salon';
import type { Card } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
interface Stock { title: string | null; hold_minutes: number; cards: Card[]; reserved: string[] }
interface Done { code: string; total: number; expires_at: string }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Page publique du stand : /salon/:token. Sans compte ; le panier vit dans le navigateur. */
export function SalonPublic({ token }: { token: string }) {
  const storeKey = `cv-salon-cart-${token}`;
  const [stock, setStock] = useState<Stock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) ?? '[]'); } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(() => {
    try { return JSON.parse(localStorage.getItem(`${storeKey}-done`) ?? 'null'); } catch { return null; }
  });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/salon/${token}/stock`);
      if (!r.ok) throw new Error(r.status === 404 ? 'Ce stand est fermé ou introuvable.' : 'Chargement impossible.');
      setStock(await r.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(cart)); } catch { /* stockage indisponible */ }
  }, [cart, storeKey]);

  const reserved = useMemo(() => new Set(stock?.reserved ?? []), [stock]);
  const byId = useMemo(() => new Map((stock?.cards ?? []).map((c) => [c.id, c])), [stock]);
  const mine = useMemo(() => cart.map((id) => byId.get(id)).filter((c): c is Card => !!c), [cart, byId]);
  const total = mine.reduce((s, c) => s + (c.price ?? 0), 0);
  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (stock?.cards ?? []).filter((c) => !n || norm([c.player, c.team, c.year, c.brand, c.set_name, c.insert_name, c.parallel_name, c.card_number].filter(Boolean).join(' ')).includes(n));
  }, [stock, q]);

  const toggle = (id: string) => setCart((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function validate() {
    setSending(true);
    setNotice(null);
    try {
      const r = await fetch(`${API_BASE}/api/salon/${token}/carts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: mine.map((c) => c.id), pseudo: pseudo.trim() || null }),
      });
      if (r.status === 409) {
        const gone: string[] = (await r.json()).detail?.unavailable ?? [];
        setCart((c) => c.filter((id) => !gone.includes(id)));
        setNotice(`${gone.length > 1 ? 'Des cartes viennent' : 'Une carte vient'} d'être prise : ${gone.length > 1 ? 'retirées' : 'retirée'} de ton panier.`);
        void load();
        return;
      }
      if (!r.ok) throw new Error();
      const d: Done = await r.json();
      try { localStorage.setItem(`${storeKey}-done`, JSON.stringify(d)); } catch { /* stockage indisponible */ }
      setDone(d);
      setCart([]);
      setOpen(false);
      void load();
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
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-sm text-[var(--text-secondary)]">Ton panier est prêt</div>
        <div className="font-mono text-6xl font-bold tracking-[0.2em] text-[var(--text-primary)]">{done.code}</div>
        {qr && <img src={qr} alt={`QR du panier ${done.code}`} className="w-64 rounded-xl bg-white p-2" />}
        <div className="text-lg font-semibold">{formatEuro(done.total)}</div>
        <p className="text-sm text-[var(--text-secondary)]">Montre ce code ou ce QR au vendeur pour régler. Les cartes te sont réservées {stock.hold_minutes} min.</p>
        <button className="ui-btn" onClick={() => { setDone(null); try { localStorage.removeItem(`${storeKey}-done`); } catch { /* stockage indisponible */ } }}>Nouveau panier</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 pb-28 pt-4">
      <h1 className="mb-3 text-xl font-semibold">{stock.title || 'Cartes à vendre'}</h1>
      <label className="relative mb-4 block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input className="ui-input w-full pl-9" placeholder="Joueur, set, année…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {notice && <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm">{notice}</div>}
      {!shown.length && <div className="py-10 text-center text-[var(--text-secondary)]">Aucune carte.</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {shown.map((c) => {
          const taken = reserved.has(c.id);
          const inCart = cart.includes(c.id);
          const meta = [c.year, c.set_name || c.brand, c.insert_name, c.parallel_name && c.parallel_name !== 'Base' ? c.parallel_name : null].filter(Boolean).join(' · ');
          return (
            <div key={c.id} className={`flex flex-col overflow-hidden rounded-xl border bg-[var(--bg-card)] ${inCart ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)]'} ${taken ? 'opacity-50' : ''}`}>
              <div className="aspect-[3/4] bg-[var(--bg-secondary)]">
                {c.image_front_url
                  ? <img src={cdnImg(c.image_front_url)} alt={c.player ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center text-[var(--text-muted)]"><ImageOff size={24} /></div>}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <div className="truncate text-sm font-semibold">{c.player ?? 'Carte'}</div>
                <div className="line-clamp-2 text-xs text-[var(--text-secondary)]">{meta}</div>
                <div className="mt-auto flex items-center justify-between pt-1.5">
                  <span className="font-semibold">{formatEuro(c.price ?? 0)}</span>
                  {taken
                    ? <span className="text-xs text-[var(--text-muted)]">Réservée</span>
                    : <button className="ui-btn ui-btn-primary h-9 px-3" aria-pressed={inCart} onClick={() => toggle(c.id)}>{inCart ? <Minus size={16} /> : <Plus size={16} />}</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {mine.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg-card)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button className="ui-btn ui-btn-primary mx-auto flex w-full max-w-md items-center justify-center gap-2" onClick={() => setOpen(true)}>
            <ShoppingBasket size={18} /> Panier · {mine.length} carte{mine.length > 1 ? 's' : ''} · {formatEuro(total)}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--bg-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-semibold">Mon panier</div>
            <ul className="divide-y divide-[var(--border)]">
              {mine.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{c.player ?? 'Carte'} <span className="text-[var(--text-secondary)]">{[c.year, c.set_name].filter(Boolean).join(' ')}</span></span>
                  <span className="flex items-center gap-2 font-medium">{formatEuro(c.price ?? 0)}<button className="ui-btn h-8 px-2" onClick={() => toggle(c.id)} aria-label="Retirer"><Minus size={14} /></button></span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between text-base font-semibold"><span>Total</span><span>{formatEuro(total)}</span></div>
            <input className="ui-input mt-3 w-full" placeholder="Ton prénom (facultatif)" value={pseudo} maxLength={60} onChange={(e) => setPseudo(e.target.value)} />
            {notice && <div className="mt-2 text-sm text-[var(--orange)]">{notice}</div>}
            <button className="ui-btn ui-btn-primary mt-3 w-full" disabled={sending || !mine.length} onClick={() => void validate()}>{sending ? 'Envoi…' : 'Valider mon panier'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
