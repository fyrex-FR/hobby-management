import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Copy, HandCoins, Maximize2, Search, Store, X } from 'lucide-react';
import { errorMessage, toast } from '../../lib/feedback';
import {
  codeFromHash, fetchCartByCode, formatEuro, minutesLeft, offerSummary, parseAmount, standUrl,
  useCartAction, useLineAction, useOfferAction, useQrDataUrl, useSalonCarts, useSalonStand, useUpdateStand,
  type SalonCart,
} from '../../lib/salon';
import { Badge, EmptyState, Modal, Page, PageHeader, Panel, Spinner } from '../ui';
import { Thumb } from '../salon/parts';
import { cardMeta } from '../salon/cardText';

const pct = (offer: number, asked: number) => Math.round((1 - offer / asked) * 100);

/** Bloc « offre sur le lot » : accepter, contre-proposer, refuser en un geste. */
function OfferPanel({ cart, onSaved }: { cart: SalonCart; onSaved: (c: SalonCart) => void }) {
  const offerAct = useOfferAction();
  const sum = offerSummary(cart.lines ?? []);
  const [counter, setCounter] = useState('');
  const counterValue = parseAmount(counter);
  const run = (action: 'accept' | 'refuse' | 'counter', total?: number) =>
    offerAct.mutate({ id: cart.id, action, total }, {
      onSuccess: (c) => { onSaved(c); setCounter(''); toast.success(action === 'accept' ? 'Offre acceptée' : action === 'refuse' ? 'Offre refusée' : 'Prix du lot envoyé'); },
      onError: (e) => toast.error('Action impossible', { description: errorMessage(e) }),
    });

  // Contre-offre suggérée : à mi-chemin entre l'offre et le prix demandé, à l'euro.
  const middle = sum.offer != null ? Math.ceil((sum.offer + sum.asked) / 2) : null;

  if (sum.offer == null) {
    return (
      <div className="flex items-center gap-2">
        <input className="ui-input h-9 flex-1" inputMode="decimal" placeholder={`Prix du lot (affiché ${formatEuro(sum.asked)})`} value={counter} onChange={(e) => setCounter(e.target.value)} />
        <button className="ui-btn h-9" disabled={!counterValue || offerAct.isPending} onClick={() => counterValue && run('counter', counterValue)}>Appliquer</button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-[var(--border-accent)] bg-[var(--accent-dim)] p-3">
      <div className="flex items-start gap-2">
        <HandCoins size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-semibold text-[var(--text-primary)]">
            Offre : {formatEuro(sum.offer)} <span className="font-normal text-[var(--text-muted)]">au lieu de {formatEuro(sum.asked)} (−{pct(sum.offer, sum.asked)} %)</span>
          </p>
          <p className="text-[var(--text-secondary)]">
            {sum.offer_state === 'offered' && 'En attente de ta réponse'}
            {sum.offer_state === 'accepted' && `Acceptée · total ${formatEuro(cart.total)}`}
            {sum.offer_state === 'countered' && `Tu as proposé ${formatEuro(cart.total)} · en attente du visiteur`}
            {sum.offer_state === 'refused' && 'Refusée · prix affiché'}
          </p>
        </div>
      </div>
      {cart.status === 'active' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button className="ui-btn ui-btn-primary" disabled={offerAct.isPending || sum.offer_state === 'accepted'} onClick={() => run('accept')}><Check size={15} /> Accepter</button>
            <button className="ui-btn" disabled={offerAct.isPending || sum.offer_state === 'refused'} onClick={() => run('refuse')}><X size={15} /> Refuser</button>
          </div>
          <div className="flex items-center gap-2">
            {middle != null && middle < sum.asked && middle > sum.offer && (
              <button className="ui-chip shrink-0" onClick={() => run('counter', middle)}>{formatEuro(middle)}</button>
            )}
            <input className="ui-input h-8 flex-1" inputMode="decimal" placeholder="Contre-offre…" value={counter} onChange={(e) => setCounter(e.target.value)} />
            <button className="ui-btn ui-btn-sm" disabled={!counterValue || offerAct.isPending} onClick={() => counterValue && run('counter', counterValue)}>Proposer</button>
          </div>
        </>
      )}
    </div>
  );
}

function CartPanel({ cart, onSaved, onClose }: { cart: SalonCart; onSaved: (c: SalonCart) => void; onClose?: () => void }) {
  const act = useCartAction();
  const lineAct = useLineAction();
  const lineOf = (id: string) => (cart.lines ?? []).find((l) => l.card_id === id);
  const editLine = (cardId: string, final: number) =>
    lineAct.mutate({ id: cart.id, cardId, final }, {
      onSuccess: onSaved,
      onError: (e) => toast.error('Modification impossible', { description: errorMessage(e) }),
    });
  const left = minutesLeft(cart.expires_at);
  const run = (action: 'pay' | 'cancel' | 'extend') =>
    act.mutate({ id: cart.id, action }, {
      onSuccess: () => { toast.success(action === 'pay' ? `Encaissé · ${formatEuro(cart.total)}` : action === 'cancel' ? 'Panier annulé' : 'Réservation prolongée'); if (action !== 'extend') onClose?.(); },
      onError: (e) => toast.error('Action impossible', { description: errorMessage(e) }),
    });
  const asked = offerSummary(cart.lines ?? []).asked;

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-2xl font-bold tracking-widest">{cart.code}</span>
          {cart.pseudo && <span className="ml-2 text-sm text-[var(--text-secondary)]">{cart.pseudo}</span>}
        </div>
        <div className="flex items-center gap-2">
          {cart.status === 'paid' && <Badge tone="green">Encaissé</Badge>}
          {cart.status === 'cancelled' && <Badge>Annulé</Badge>}
          {cart.status === 'active' && <Badge tone={left > 0 ? 'accent' : 'red'}><Clock size={12} /> {left > 0 ? `${left} min` : 'expiré'}</Badge>}
          {onClose && <button className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8" onClick={onClose} aria-label="Fermer"><X size={15} /></button>}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-[var(--border)]">
        {cart.cards.map((c) => {
          const l = lineOf(c.id);
          return (
            <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
              <Thumb url={c.image_front_url} className="h-14 w-10 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.player ?? 'Carte'}</div>
                <div className="truncate text-xs text-[var(--text-secondary)]">{[cardMeta(c), c.insert_name, c.parallel_name].filter(Boolean).join(' · ')}</div>
              </div>
              {l && cart.status === 'active' ? (
                <div className="flex flex-col items-end">
                  <input
                    key={`${l.final}-${l.state}`}
                    className="ui-input tabular h-8 w-20 text-right text-sm"
                    inputMode="decimal"
                    defaultValue={l.final}
                    aria-label={`Prix de ${c.player ?? 'la carte'}`}
                    onBlur={(e) => { const v = parseAmount(e.target.value); if (v && v !== l.final) editLine(c.id, v); }}
                  />
                  {l.final !== l.asked && <s className="tabular mt-0.5 text-[11px] text-[var(--text-muted)]">{formatEuro(l.asked)}</s>}
                </div>
              ) : <span className="tabular font-medium">{formatEuro(l?.final ?? c.price ?? 0)}</span>}
            </li>
          );
        })}
      </ul>

      {cart.status === 'active' && (cart.lines ?? []).length > 0 && <div className="mt-3"><OfferPanel cart={cart} onSaved={onSaved} /></div>}

      <div className="mt-3 flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="tabular">{cart.total !== asked && <s className="mr-2 text-sm font-normal text-[var(--text-muted)]">{formatEuro(asked)}</s>}{formatEuro(cart.total)}</span>
      </div>
      {cart.status === 'active' && (
        <div className="mt-3 flex gap-2">
          <button className="ui-btn ui-btn-primary ui-btn-lg flex-1" disabled={act.isPending} onClick={() => run('pay')}><Check size={16} /> Encaisser {formatEuro(cart.total)}</button>
          <button className="ui-btn ui-btn-lg" disabled={act.isPending} onClick={() => run('extend')}>+30 min</button>
          <button className="ui-btn ui-btn-lg ui-btn-ghost" disabled={act.isPending} onClick={() => run('cancel')}>Annuler</button>
        </div>
      )}
    </Panel>
  );
}

/** Empreinte de ce qui mérite une alerte : nouveau panier, panier modifié, nouvelle offre. */
const fingerprint = (c: SalonCart) => `${c.card_ids.join(',')}|${offerSummary(c.lines ?? []).offer ?? ''}`;

export function SalonView() {
  const { data: stand } = useSalonStand();
  const updateStand = useUpdateStand();
  const { data: carts = [], isLoading } = useSalonCarts();
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<SalonCart | null>(null);
  const [bigQr, setBigQr] = useState(false);
  const seen = useRef<Map<string, string> | null>(null);
  const url = stand ? standUrl(stand.token) : null;
  const qr = useQrDataUrl(url);

  async function find(c: string) {
    try {
      setSelected(await fetchCartByCode(c));
      setCode('');
    } catch (e) {
      toast.error('Panier introuvable', { description: errorMessage(e) });
    }
  }

  useEffect(() => {
    const c = codeFromHash();
    if (c) fetchCartByCode(c).then(setSelected, (e) => toast.error('Panier introuvable', { description: errorMessage(e) }));
  }, []);

  // Alerte quand un visiteur réserve, modifie son panier ou fait une offre.
  useEffect(() => {
    if (isLoading) return;
    const active = carts.filter((c) => c.status === 'active');
    if (seen.current) {
      for (const c of active) {
        const before = seen.current.get(c.id);
        const now = fingerprint(c);
        if (before === now) continue;
        const sum = offerSummary(c.lines ?? []);
        const who = c.pseudo ? ` · ${c.pseudo}` : '';
        if (before === undefined) toast.info(`Nouveau panier ${c.code}${who}`, { description: `${c.card_ids.length} carte${c.card_ids.length > 1 ? 's' : ''} · ${sum.offer != null ? `offre ${formatEuro(sum.offer)} pour ${formatEuro(sum.asked)}` : formatEuro(c.total)}` });
        else toast.info(`Panier ${c.code} modifié${who}`, { description: sum.offer != null ? `Nouvelle offre : ${formatEuro(sum.offer)} pour ${formatEuro(sum.asked)}` : `${c.card_ids.length} carte${c.card_ids.length > 1 ? 's' : ''} · ${formatEuro(c.total)}` });
        try { navigator.vibrate?.([60, 40, 60]); } catch { /* pas de vibreur */ }
      }
    }
    seen.current = new Map(active.map((c) => [c.id, fingerprint(c)]));
  }, [carts, isLoading]);

  const active = carts
    .filter((c) => c.status === 'active')
    .sort((a, b) => Number(offerSummary(b.lines ?? []).offer_state === 'offered') - Number(offerSummary(a.lines ?? []).offer_state === 'offered'));
  const paid = carts.filter((c) => c.status === 'paid');
  const earned = paid.reduce((s, c) => s + c.total, 0);
  // La liste est rafraîchie toutes les 5 s : on affiche sa version quand elle existe.
  const shown = selected ? { ...selected, ...(carts.find((c) => c.id === selected.id) ?? {}) } : null;
  const onSaved = (c: SalonCart) => setSelected((s) => (s ? { ...s, ...c, cards: s.cards } : s));

  return (
    <Page width="narrow">
      <PageHeader title="Salon" subtitle={`Encaissé aujourd'hui : ${formatEuro(earned)} · ${paid.length} panier${paid.length > 1 ? 's' : ''}`} />

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim().length === 4) void find(code.trim()); }}>
        <input className="ui-input h-10 flex-1 font-mono text-base uppercase tracking-widest" placeholder="Code du panier" maxLength={4} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
        <button className="ui-btn ui-btn-primary h-10" type="submit"><Search size={16} /> Ouvrir</button>
      </form>

      {shown && <CartPanel cart={shown} onSaved={onSaved} onClose={() => setSelected(null)} />}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Paniers en attente ({active.length})</h2>
        {isLoading ? <Spinner /> : !active.length ? (
          <EmptyState icon={Store} title="Aucun panier en attente" description="Les réservations des visiteurs apparaissent ici en direct." />
        ) : (
          <ul className="space-y-2">
            {active.map((c) => {
              const sum = offerSummary(c.lines ?? []);
              const left = minutesLeft(c.expires_at);
              return (
                <li key={c.id}>
                  <button
                    className={`flex w-full items-center gap-3 rounded-xl border bg-[var(--bg-card)] p-3 text-left transition-colors hover:bg-[var(--bg-elevated)] ${selected?.id === c.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}
                    onClick={() => setSelected(c)}
                  >
                    <span className="font-mono text-lg font-bold tracking-widest">{c.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--text-primary)]">{c.pseudo ?? 'Visiteur'} · {c.card_ids.length} carte{c.card_ids.length > 1 ? 's' : ''}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{left > 0 ? `encore ${left} min` : 'expiré'}</span>
                    </span>
                    {sum.offer_state === 'offered' && <Badge tone="accent"><HandCoins size={12} /> Offre −{pct(sum.offer ?? 0, sum.asked)} %</Badge>}
                    {sum.offer_state === 'countered' && <Badge tone="blue">Contre-offre</Badge>}
                    {sum.offer_state === 'accepted' && <Badge tone="green">Accord</Badge>}
                    <span className="tabular font-semibold">{formatEuro(sum.offer_state === 'offered' ? sum.offer ?? c.total : c.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {stand && (
        <Panel title="Stand" icon={Store} action={
          <button className="ui-btn ui-btn-sm" data-active={stand.is_open} onClick={() => updateStand.mutate({ is_open: !stand.is_open })}>
            <span className={`h-2 w-2 rounded-full ${stand.is_open ? 'bg-[var(--green)]' : 'bg-[var(--text-muted)]'}`} /> {stand.is_open ? 'Ouvert' : 'Fermé'}
          </button>
        }>
          <p className="text-xs text-[var(--text-secondary)]">Les visiteurs voient tes cartes « à vendre » qui ont un prix. Ferme le stand pour couper l'accès.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              key={`t-${stand.title ?? ''}`}
              className="ui-input"
              placeholder="Nom du stand (ex. Stand Xavier · Paris Card Show)"
              defaultValue={stand.title ?? ''}
              onBlur={(e) => { if (e.target.value.trim() !== (stand.title ?? '')) updateStand.mutate({ title: e.target.value.trim() }); }}
            />
            <input
              key={`p-${stand.paypal_me ?? ''}`}
              className="ui-input"
              placeholder="Pseudo PayPal.me (facultatif)"
              defaultValue={stand.paypal_me ?? ''}
              onBlur={(e) => { if (e.target.value.trim() !== (stand.paypal_me ?? '')) updateStand.mutate({ paypal_me: e.target.value.trim() }, { onError: (err) => toast.error('PayPal.me invalide', { description: errorMessage(err) }) }); }}
            />
          </div>
          {qr && (
            <button className="mx-auto mt-4 block" onClick={() => setBigQr(true)} aria-label="Afficher le QR en grand">
              <img src={qr} alt="QR du stand" className="w-48 rounded-xl bg-white p-2" />
            </button>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs">
            <code className="min-w-0 flex-1 truncate">{url}</code>
            <button className="ui-btn ui-btn-sm" onClick={() => setBigQr(true)}><Maximize2 size={13} /> Plein écran</button>
            <button className="ui-btn ui-btn-sm ui-btn-icon" onClick={() => { void navigator.clipboard.writeText(url!); toast.success('Lien copié'); }} aria-label="Copier le lien"><Copy size={13} /></button>
          </div>
        </Panel>
      )}

      <Modal open={bigQr} onClose={() => setBigQr(false)} size="md">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-xl font-semibold text-[var(--text-primary)]">{stand?.title || 'Cartes à vendre'}</p>
          {qr && <img src={qr} alt="QR du stand" className="w-full max-w-sm rounded-2xl bg-white p-3" />}
          <p className="text-[15px] text-[var(--text-secondary)]">Scanne pour voir les cartes, réserver et faire une offre</p>
        </div>
      </Modal>
    </Page>
  );
}
