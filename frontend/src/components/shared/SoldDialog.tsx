import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useUpdateCard } from '../../hooks/useCards';
import { displayPrice } from '../../lib/collectionFilters';
import { errorMessage, toast } from '../../lib/feedback';
import { SALE_CHANNELS, guessChannel, spreadTotal } from '../../lib/sales';
import type { Card, SaleChannel } from '../../types';
import { Field, Modal } from '../ui';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(/[€\s]/g, '').replace(',', '.'));
  return raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * « Vendue à… » : enregistre le prix encaissé, le canal et la date de la vente
 * (distincts du prix demandé), pour une carte ou un lot. Sur un lot, le total
 * est réparti au prorata des prix demandés. Propose de retirer l'annonce eBay
 * et rappelle l'annonce Vinted quand la vente s'est faite ailleurs.
 */
export function SoldDialog({
  cards,
  initialTotal,
  title,
  onClose,
  onDone,
}: {
  cards: Card[];
  /** Prix convenu (offre d'un acheteur…) ; sinon la somme des prix demandés. */
  initialTotal?: number | null;
  title?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const updateCard = useUpdateCard();
  const asked = cards.reduce((s, c) => s + (displayPrice(c) ?? 0), 0);
  const [amount, setAmount] = useState(() => {
    const v = initialTotal ?? (asked > 0 ? asked : null);
    return v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  });
  const [channel, setChannel] = useState<SaleChannel>(() => guessChannel(cards));
  const [date, setDate] = useState(today);
  const [withdrawEbay, setWithdrawEbay] = useState(true);
  const [busy, setBusy] = useState(false);

  const total = parseAmount(amount);
  const invalid = amount.trim() !== '' && total == null;
  const n = cards.length;
  const onEbay = cards.filter((c) => c.ebay_offer_id);
  const onVinted = cards.filter((c) => c.vinted_url);
  const shares = useMemo(() => (total != null && n > 1 ? spreadTotal(cards, total) : null), [cards, total, n]);

  async function confirm() {
    if (invalid) return;
    setBusy(true);
    // Midi heure locale : la date choisie reste la même quel que soit le fuseau.
    const soldAt = new Date(`${date}T12:00:00`).toISOString();
    const before = cards.map((c) => ({ id: c.id, status: c.status, is_listed: c.is_listed, quantity: c.quantity }));
    try {
      await Promise.all(cards.map((c) => {
        const price = total == null ? null : n > 1 ? shares?.get(c.id) ?? null : total;
        // Plusieurs exemplaires : on en retire un, la carte reste en vente.
        if ((c.quantity ?? 1) > 1) return updateCard.mutateAsync({ id: c.id, quantity: (c.quantity ?? 1) - 1 });
        return updateCard.mutateAsync({ id: c.id, status: 'vendu', is_listed: false, sold_price: price, sold_at: soldAt, sold_channel: channel });
      }));
    } catch (e) {
      toast.error('Vente non enregistrée', { description: errorMessage(e) });
      setBusy(false);
      return;
    }

    let ebayFailed = 0;
    if (channel !== 'ebay' && withdrawEbay && onEbay.length) {
      const results = await Promise.allSettled(onEbay.map((c) => apiFetch(`/ebay/selling/withdraw/${c.id}`, { method: 'POST' })));
      ebayFailed = results.filter((r) => r.status === 'rejected').length;
    }

    toast.success(n > 1 ? `${n} cartes vendues` : 'Carte vendue', {
      description: total != null ? `${euro.format(total)} · ${SALE_CHANNELS.find((c) => c.value === channel)?.label}` : undefined,
      action: {
        label: 'Annuler',
        onClick: () => Promise.all(before.map((b) => updateCard.mutateAsync({ id: b.id, status: b.status, is_listed: b.is_listed, quantity: b.quantity })))
          .catch((e) => toast.error('Annulation impossible', { description: errorMessage(e) })),
      },
    });
    if (ebayFailed) toast.error(`${ebayFailed} annonce${ebayFailed > 1 ? 's' : ''} eBay à retirer à la main`);
    onDone?.();
    onClose();
  }

  return (
    <Modal
      onClose={busy ? () => {} : onClose}
      dismissible={!busy}
      size="sm"
      zIndex={90}
      title={title ?? (n > 1 ? `Vendre ${n} cartes` : `Vendre ${cards[0]?.player ?? 'la carte'}`)}
      subtitle={asked > 0 ? `Prix demandé : ${euro.format(asked)}` : undefined}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="ui-btn">Annuler</button>
          <button onClick={confirm} disabled={busy || invalid} className="ui-btn ui-btn-primary">
            {busy ? 'Enregistrement…' : 'Enregistrer la vente'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label={n > 1 ? 'Prix encaissé pour le lot' : 'Prix encaissé'}
          error={invalid ? 'Saisis un montant, par exemple 12,50.' : undefined}
          hint={n > 1 && total != null ? 'Réparti sur les cartes au prorata de leur prix demandé.' : 'Laisse vide si tu ne le connais pas.'}
        >
          <div className="relative">
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
              inputMode="decimal"
              placeholder="0,00"
              className="ui-input tabular pr-8 text-base"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)]">€</span>
          </div>
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Vendue sur</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Canal de vente">
            {SALE_CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={channel === c.value}
                data-active={channel === c.value}
                onClick={() => setChannel(c.value)}
                className="ui-chip"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Le">
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="ui-input tabular" />
        </Field>

        {channel !== 'ebay' && onEbay.length > 0 && (
          <label className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2.5 text-[13px] text-[var(--text-secondary)]">
            <input type="checkbox" checked={withdrawEbay} onChange={(e) => setWithdrawEbay(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>Retirer {onEbay.length > 1 ? `les ${onEbay.length} annonces eBay` : 'l’annonce eBay'} tout de suite</span>
          </label>
        )}

        {channel !== 'vinted' && onVinted.length > 0 && (
          <div className="rounded-lg border border-[var(--border)] px-3 py-2.5 text-[13px] text-[var(--text-secondary)]">
            <p>Pense à retirer {onVinted.length > 1 ? 'ces annonces Vinted' : 'l’annonce Vinted'} :</p>
            <ul className="mt-1.5 space-y-1">
              {onVinted.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <a href={c.vinted_url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-2">
                    {c.player ?? 'Annonce'} <ExternalLink size={12} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
