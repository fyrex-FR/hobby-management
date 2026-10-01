import { useEffect, useState } from 'react';
import { Check, Clock, Copy, Search, Store, X } from 'lucide-react';
import { errorMessage, toast } from '../../lib/feedback';
import {
  codeFromHash, fetchCartByCode, formatEuro, minutesLeft, standUrl, useCartAction, useLineAction, useQrDataUrl, useSalonCarts, useSalonStand, useUpdateStand,
  type SalonCart, type SalonLine,
} from '../../lib/salon';
import { cdnImg } from '../../lib/cdn';
import { Badge, EmptyState, Page, PageHeader, Panel, Spinner } from '../ui';

function CartPanel({ cart, onClose }: { cart: SalonCart; onClose?: () => void }) {
  const act = useCartAction();
  const lineAct = useLineAction();
  const [lines, setLines] = useState<SalonLine[]>(cart.lines ?? []);
  const [sum, setSum] = useState(cart.total);
  const lineOf = (id: string) => lines.find((l) => l.card_id === id);
  const editLine = (cardId: string, body: { final?: number; state?: 'accepted' | 'refused' }) =>
    lineAct.mutate({ id: cart.id, cardId, ...body }, {
      onSuccess: (c) => { setLines(c.lines); setSum(c.total); },
      onError: (e) => toast.error('Modification impossible', { description: errorMessage(e) }),
    });
  const left = minutesLeft(cart.expires_at);
  const run = (action: 'pay' | 'cancel' | 'extend') =>
    act.mutate({ id: cart.id, action }, {
      onSuccess: () => { toast.success(action === 'pay' ? 'Encaissé' : action === 'cancel' ? 'Panier annulé' : 'Réservation prolongée'); if (action !== 'extend') onClose?.(); },
      onError: (e) => toast.error('Action impossible', { description: errorMessage(e) }),
    });
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="font-mono text-2xl font-bold tracking-widest">{cart.code}</span>
          {cart.pseudo && <span className="ml-2 text-sm text-[var(--text-secondary)]">{cart.pseudo}</span>}
        </div>
        <div className="flex items-center gap-2">
          {cart.status === 'paid' && <Badge tone="green">Encaissé</Badge>}
          {cart.status === 'cancelled' && <Badge>Annulé</Badge>}
          {cart.status === 'active' && <Badge tone={left > 0 ? 'accent' : 'red'}><Clock size={12} /> {left > 0 ? `${left} min` : 'expiré'}</Badge>}
          {onClose && <button className="ui-btn h-8 px-2" onClick={onClose} aria-label="Fermer"><X size={14} /></button>}
        </div>
      </div>
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {cart.cards.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
            <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-[var(--bg-secondary)]">
              {c.image_front_url && <img src={cdnImg(c.image_front_url)} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.player ?? 'Carte'}</div>
              <div className="truncate text-xs text-[var(--text-secondary)]">{[c.year, c.set_name || c.brand, c.insert_name, c.parallel_name].filter(Boolean).join(' · ')}</div>
            </div>
            {(() => {
              const l = lineOf(c.id);
              if (!l) return <span className="font-medium">{formatEuro(c.price ?? 0)}</span>;
              return (
                <div className="flex flex-col items-end gap-1">
                  {l.offer != null && <span className="text-xs text-[var(--text-secondary)]">Offre {formatEuro(l.offer)}{l.state === 'accepted' ? ' ✓' : l.state === 'refused' ? ' ✗' : l.state === 'countered' ? ' → contre' : ''}</span>}
                  {cart.status === 'active' ? (
                    <input
                      key={`${l.final}-${l.state}`}
                      className="ui-input h-8 w-20 text-right text-sm"
                      inputMode="decimal"
                      defaultValue={l.final}
                      aria-label="Prix final"
                      onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v > 0 && v !== l.final) editLine(c.id, { final: v }); }}
                    />
                  ) : <span className="font-medium">{formatEuro(l.final)}</span>}
                  {cart.status === 'active' && l.offer != null && l.state === 'offered' && (
                    <div className="flex gap-1">
                      <button className="ui-btn h-7 px-2 text-xs" onClick={() => editLine(c.id, { state: 'accepted' })}>Accepter</button>
                      <button className="ui-btn h-7 px-2 text-xs" onClick={() => editLine(c.id, { state: 'refused' })}>Refuser</button>
                    </div>
                  )}
                </div>
              );
            })()}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between text-lg font-semibold"><span>Total</span><span>{formatEuro(sum)}</span></div>
      {cart.status === 'active' && (
        <div className="mt-3 flex gap-2">
          <button className="ui-btn ui-btn-primary flex-1" disabled={act.isPending} onClick={() => run('pay')}><Check size={16} /> Encaissé</button>
          <button className="ui-btn" disabled={act.isPending} onClick={() => run('extend')}>+30 min</button>
          <button className="ui-btn" disabled={act.isPending} onClick={() => run('cancel')}>Annuler</button>
        </div>
      )}
    </Panel>
  );
}

export function SalonView() {
  const { data: stand } = useSalonStand();
  const updateStand = useUpdateStand();
  const { data: carts = [], isLoading } = useSalonCarts();
  const [code, setCode] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<SalonCart | null>(null);
  const url = stand ? standUrl(stand.token) : null;
  const qr = useQrDataUrl(url);

  async function find(c: string) {
    try {
      setLookup(await fetchCartByCode(c));
      setCode('');
    } catch (e) {
      toast.error('Panier introuvable', { description: errorMessage(e) });
    }
  }

  useEffect(() => {
    const c = codeFromHash();
    if (c) fetchCartByCode(c).then(setLookup, (e) => toast.error('Panier introuvable', { description: errorMessage(e) }));
  }, []);

  const active = carts.filter((c) => c.status === 'active');
  const paid = carts.filter((c) => c.status === 'paid');
  const earned = paid.reduce((s, c) => s + c.total, 0);
  const shownCart = lookup ?? carts.find((c) => c.id === openId) ?? null;

  return (
    <Page width="narrow">
      <PageHeader title="Salon" subtitle={`Encaissé aujourd'hui : ${formatEuro(earned)} · ${paid.length} panier${paid.length > 1 ? 's' : ''}`} />

      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim().length === 4) void find(code.trim()); }}>
        <input className="ui-input flex-1 font-mono uppercase tracking-widest" placeholder="Code du panier" maxLength={4} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
        <button className="ui-btn ui-btn-primary" type="submit"><Search size={16} /> Ouvrir</button>
      </form>

      {shownCart && <div className="mb-4"><CartPanel cart={shownCart} onClose={() => { setLookup(null); setOpenId(null); }} /></div>}

      <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">Paniers en attente ({active.length})</h2>
      {isLoading ? <Spinner /> : !active.length ? (
        <EmptyState icon={Store} title="Aucun panier en attente" description="Les paniers validés par les visiteurs apparaissent ici." />
      ) : (
        <ul className="mb-6 space-y-2">
          {active.map((c) => (
            <li key={c.id}>
              <button className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-left" onClick={() => { setLookup(null); setOpenId(c.id); }}>
                <span><span className="font-mono text-lg font-bold tracking-widest">{c.code}</span> <span className="text-sm text-[var(--text-secondary)]">{c.pseudo ?? ''} · {c.card_ids.length} carte{c.card_ids.length > 1 ? 's' : ''}</span></span>
                <span className="font-semibold">{formatEuro(c.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {stand && (
        <Panel>
          <div className="flex items-center justify-between">
            <div className="font-semibold">Stand</div>
            <button className="ui-btn" data-active={stand.is_open} onClick={() => updateStand.mutate({ is_open: !stand.is_open })}>{stand.is_open ? 'Ouvert' : 'Fermé'}</button>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Les visiteurs voient tes cartes « à vendre » avec un prix. Ferme le stand pour couper l'accès.</p>
          <input
            key={stand.paypal_me ?? ''}
            className="ui-input mt-3 w-full"
            placeholder="Pseudo PayPal.me (facultatif)"
            defaultValue={stand.paypal_me ?? ''}
            onBlur={(e) => { if (e.target.value.trim() !== (stand.paypal_me ?? '')) updateStand.mutate({ paypal_me: e.target.value.trim() }); }}
          />
          {qr && <img src={qr} alt="QR du stand" className="mx-auto mt-3 w-56 rounded-xl bg-white p-2" />}
          <div className="mt-2 flex items-center gap-2 text-xs">
            <code className="min-w-0 flex-1 truncate">{url}</code>
            <button className="ui-btn h-8 px-2" onClick={() => { void navigator.clipboard.writeText(url!); toast.success('Lien copié'); }} aria-label="Copier le lien"><Copy size={14} /></button>
          </div>
        </Panel>
      )}
    </Page>
  );
}
