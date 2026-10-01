import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Clock, HandCoins, Loader2, Plus, XCircle } from 'lucide-react';
import { cartUrl, formatEuro, minutesLeft, useQrDataUrl, type PublicCart, type SalonTicket as Ticket } from '../../lib/salon';
import { Thumb } from './parts';

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function OfferBlock({ cart, busy, onAccept }: { cart: PublicCart; busy: boolean; onAccept: () => void }) {
  if (cart.offer_state === 'none' || cart.offer == null) return null;
  const base = 'flex items-start gap-3 rounded-xl border p-3 text-left text-[13px]';
  if (cart.offer_state === 'offered') {
    return (
      <div className={`${base} border-[var(--border)] bg-[var(--bg-secondary)]`}>
        <Loader2 size={18} className="mt-px shrink-0 animate-spin text-[var(--text-muted)]" />
        <div><p className="font-medium text-[var(--text-primary)]">Offre de {formatEuro(cart.offer)} envoyée</p><p className="text-[var(--text-muted)]">Le vendeur va répondre, cette page se met à jour toute seule.</p></div>
      </div>
    );
  }
  if (cart.offer_state === 'accepted') {
    return (
      <div className={`${base} border-[color-mix(in_srgb,var(--green)_30%,transparent)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)]`}>
        <CheckCircle2 size={18} className="mt-px shrink-0 text-[var(--green)]" />
        <div><p className="font-medium text-[var(--text-primary)]">Offre acceptée : {formatEuro(cart.total)}</p><p className="text-[var(--text-muted)]">Passe au stand pour régler.</p></div>
      </div>
    );
  }
  if (cart.offer_state === 'countered') {
    return (
      <div className={`${base} border-[var(--border-accent)] bg-[var(--accent-dim)]`}>
        <HandCoins size={18} className="mt-px shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text-primary)]">Le vendeur te propose {formatEuro(cart.total)}</p>
          <p className="text-[var(--text-muted)]">Tu avais offert {formatEuro(cart.offer)} (prix affiché {formatEuro(cart.asked)}).</p>
          <button className="ui-btn ui-btn-primary ui-btn-sm mt-2" disabled={busy} onClick={onAccept}><Check size={14} /> J'accepte {formatEuro(cart.total)}</button>
        </div>
      </div>
    );
  }
  return (
    <div className={`${base} border-[var(--border)] bg-[var(--bg-secondary)]`}>
      <XCircle size={18} className="mt-px shrink-0 text-[var(--text-muted)]" />
      <div><p className="font-medium text-[var(--text-primary)]">Offre de {formatEuro(cart.offer)} refusée</p><p className="text-[var(--text-muted)]">Le prix reste {formatEuro(cart.total)}. Tu peux en parler au stand ou modifier ton panier.</p></div>
    </div>
  );
}

/** Écran « ma réservation » : ce que le visiteur montre au vendeur pour payer. */
export function SalonTicket({ ticket, cart, title, paypalMe, busy, onBrowse, onEdit, onCancel, onAccept, onDone }: {
  ticket: Ticket;
  cart: PublicCart | null;
  title: string;
  paypalMe: string | null;
  busy: boolean;
  onBrowse: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onDone: () => void;
}) {
  const now = useNow(10000);
  const status = cart?.status ?? 'active';
  const live = status === 'active';
  const qr = useQrDataUrl(live ? cartUrl(ticket.code) : null);
  const left = cart ? minutesLeft(cart.expires_at, now) : null;

  if (status === 'paid') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-[var(--green)]"><Check size={30} /></div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Merci, c'est réglé !</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{cart?.lines.length ?? 0} carte{(cart?.lines.length ?? 0) > 1 ? 's' : ''} · {formatEuro(cart?.total ?? 0)}. Bon salon !</p>
        </div>
        <button className="ui-btn ui-btn-lg" onClick={onDone}>Retour au stand</button>
      </div>
    );
  }

  if (status === 'cancelled' || status === 'expired') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]"><Clock size={28} /></div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{status === 'expired' ? 'Réservation expirée' : 'Réservation annulée'}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{status === 'expired' ? 'Les cartes ont été remises en vente. Tu peux les réserver à nouveau si elles sont libres.' : 'Les cartes sont de nouveau disponibles.'}</p>
        </div>
        {status === 'expired' && <button className="ui-btn ui-btn-primary ui-btn-lg" onClick={onEdit}>Réserver à nouveau</button>}
        <button className="ui-btn" onClick={onDone}>Retour au stand</button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <header className="flex h-14 items-center gap-2">
        <button className="ui-btn ui-btn-ghost ui-btn-sm -ml-2" onClick={onBrowse}><ArrowLeft size={16} /> {title}</button>
      </header>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-[13px] text-[var(--text-muted)]">Ma réservation · montre ce code au vendeur</p>
        <div className="tabular font-mono text-6xl font-bold tracking-[0.18em] text-[var(--text-primary)]">{ticket.code}</div>
        {qr ? <img src={qr} alt={`QR de la réservation ${ticket.code}`} className="w-52 rounded-2xl bg-white p-2.5" /> : <div className="h-52 w-52 rounded-2xl bg-[var(--bg-secondary)]" />}
        {left != null && (
          <p className={`inline-flex items-center gap-1.5 text-[13px] ${left <= 5 ? 'text-[var(--red)]' : 'text-[var(--text-secondary)]'}`}>
            <Clock size={14} /> Cartes bloquées encore {Math.max(left, 0)} min
          </p>
        )}
      </div>

      {cart && (
        <div className="mt-6 space-y-4">
          <OfferBlock cart={cart} busy={busy} onAccept={onAccept} />

          <section className="ui-card divide-y divide-[var(--border)]">
            {cart.lines.map((l) => (
              <div key={l.card_id} className="flex items-center gap-3 px-3 py-2">
                <Thumb url={l.image_front_url} className="h-12 w-9 shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{l.player ?? 'Carte'}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{[l.year, l.set_name].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="tabular text-right text-[13px]">
                  {/* Offre sur le lot : le prix négocié se lit sur le total, pas carte par carte. */}
                  {cart.offer == null && l.final !== l.asked && <s className="mr-1.5 text-xs text-[var(--text-muted)]">{formatEuro(l.asked)}</s>}
                  <span className="font-semibold text-[var(--price)]">{formatEuro(cart.offer == null ? l.final : l.asked)}</span>
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-3">
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">Total à payer</span>
              <span className="tabular text-lg font-semibold text-[var(--text-primary)]">
                {cart.total !== cart.asked && <s className="mr-2 text-sm font-normal text-[var(--text-muted)]">{formatEuro(cart.asked)}</s>}
                {formatEuro(cart.total)}
              </span>
            </div>
          </section>

          {paypalMe && cart.offer_state !== 'offered' && cart.offer_state !== 'countered' && (
            <a className="ui-btn ui-btn-lg w-full" href={`https://www.paypal.me/${paypalMe}/${cart.total}EUR`} target="_blank" rel="noreferrer">
              Payer {formatEuro(cart.total)} avec PayPal
            </a>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button className="ui-btn" onClick={onEdit}><Plus size={15} /> Modifier le panier</button>
            <button className="ui-btn ui-btn-danger" disabled={busy} onClick={onCancel}>Annuler la réservation</button>
          </div>
        </div>
      )}
    </div>
  );
}
