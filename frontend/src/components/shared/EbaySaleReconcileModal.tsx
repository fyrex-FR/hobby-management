import { useMemo, useState } from 'react';
import { X, Loader2, ExternalLink, Check, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { useUpdateCard } from '../../hooks/useCards';
import { EbayLogo, VintedLogo } from './EbayLogo';
import { cdnImg } from '../../lib/cdn';
import { ebayToWithdraw, vintedToRemove } from '../../lib/saleReconcile';
import type { Card } from '../../types';

interface Props {
  cards: Card[];
  onClose: () => void;
}

function Row({ card, right }: { card: Card; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 px-2.5">
      {card.image_front_url ? (
        <img src={cdnImg(card.image_front_url)} alt="" className="w-8 h-11 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-8 h-11 rounded-lg shrink-0 flex items-center justify-center text-xs" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{card.player ?? '—'}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
          {[card.year, card.set_name].filter(Boolean).join(' · ')}
        </p>
      </div>
      {right}
    </div>
  );
}

/** « Ventes à finaliser » : après une vente, l'annonce de l'autre plateforme
 * reste active. Volontairement un RÉCAP QU'ON VALIDE, jamais une fermeture
 * automatique — fermer tout seul est trop risqué (et Vinted n'a aucune notion
 * de quantité). */
export function EbaySaleReconcileModal({ cards, onClose }: Props) {
  const qc = useQueryClient();
  const updateCard = useUpdateCard();

  const vintedCards = useMemo(() => vintedToRemove(cards), [cards]);
  const ebayCards = useMemo(() => ebayToWithdraw(cards), [cards]);

  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [withdrawing, setWithdrawing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<{ card_id: string; player: string | null; message: string }[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [clearing, setClearing] = useState<string | null>(null);

  const selected = ebayCards.filter((c) => !deselected.has(c.id));

  function toggle(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** L'annonce Vinted a été retirée à la main : on efface le lien pour que la
   * carte sorte définitivement du récap. */
  async function markVintedRemoved(card: Card) {
    setClearing(card.id);
    try {
      await updateCard.mutateAsync({ id: card.id, vinted_url: null });
    } finally {
      setClearing(null);
    }
  }

  async function withdrawSelected() {
    if (!selected.length) return;
    setWithdrawing(true);
    setErrors([]);
    setDoneCount(0);
    const failed: typeof errors = [];
    let ok = 0;
    try {
      for (let i = 0; i < selected.length; i++) {
        const card = selected[i];
        setProgress({ done: i, total: selected.length });
        try {
          await apiFetch(`/ebay/selling/withdraw/${card.id}`, { method: 'POST' });
          ok += 1;
        } catch (e) {
          // Une annonce en échec ne doit pas interrompre le lot.
          failed.push({ card_id: card.id, player: card.player, message: (e as Error).message });
        }
      }
      setDoneCount(ok);
      setErrors(failed);
    } finally {
      setWithdrawing(false);
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['cards'] });
    }
  }

  const total = vintedCards.length + ebayCards.length;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={withdrawing ? undefined : onClose}>
      <div
        className="w-full max-w-lg rounded-3xl glass border-strong shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-black uppercase tracking-widest text-white">Ventes à finaliser</span>
          </div>
          <button
            onClick={onClose}
            disabled={withdrawing}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {total === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={36} style={{ color: 'var(--green)' }} />
            <p className="text-sm font-bold text-white">Tout est à jour</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Aucune annonce à retirer après tes ventes.
            </p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Ces cartes sont vendues mais une annonce est encore en ligne ailleurs — risque de la vendre deux fois. Rien n'est fait automatiquement : tu valides.
          </p>
        )}

        {vintedCards.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <VintedLogo width={44} height={12} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Encore en ligne ({vintedCards.length})
              </span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Vendues sur eBay. Vinted n’ayant pas d’API, le retrait se fait à la main : ouvre l’annonce, supprime-la, puis marque-la ici.
            </p>
            <div className="flex flex-col gap-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
              {vintedCards.map((card) => (
                <Row
                  key={card.id}
                  card={card}
                  right={
                    <div className="flex items-center gap-2 shrink-0">
                      {card.ebay_sold_price != null && (
                        <span className="text-xs font-black" style={{ color: 'var(--green)' }}>{card.ebay_sold_price} €</span>
                      )}
                      <a
                        href={card.vinted_url!}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-bold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <ExternalLink size={12} /> Ouvrir
                      </a>
                      <button
                        onClick={() => markVintedRemoved(card)}
                        disabled={clearing === card.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}
                      >
                        {clearing === card.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        J’ai retiré
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </div>
        )}

        {ebayCards.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <EbayLogo width={34} height={13} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Encore en ligne ({ebayCards.length})
              </span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Marquées vendues ailleurs, mais toujours en vente sur eBay. Celles-ci, l’app peut les retirer.
            </p>
            <div className="flex flex-col gap-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
              {ebayCards.map((card) => (
                <Row
                  key={card.id}
                  card={card}
                  right={
                    <div className="flex items-center gap-2 shrink-0">
                      {card.price != null && (
                        <span className="text-xs font-black" style={{ color: 'var(--accent)' }}>{card.price} €</span>
                      )}
                      <a
                        href={card.ebay_url!}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-bold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <ExternalLink size={12} />
                      </a>
                      <input
                        type="checkbox"
                        checked={!deselected.has(card.id)}
                        disabled={withdrawing}
                        onChange={() => toggle(card.id)}
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                    </div>
                  }
                />
              ))}
            </div>

            {errors.length > 0 && (
              <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto rounded-lg px-2 py-1.5" style={{ background: 'rgba(239,68,68,0.06)' }}>
                {errors.map((e) => (
                  <li key={e.card_id} className="text-[11px]" style={{ color: 'var(--red)' }}>
                    {(e.player || e.card_id)} — {e.message}
                  </li>
                ))}
              </ul>
            )}

            {doneCount > 0 && !withdrawing && (
              <p className="text-xs font-bold" style={{ color: 'var(--green)' }}>
                ✅ {doneCount} annonce{doneCount > 1 ? 's' : ''} retirée{doneCount > 1 ? 's' : ''} d’eBay
              </p>
            )}

            <button
              onClick={withdrawSelected}
              disabled={withdrawing || selected.length === 0}
              className="self-start flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              {withdrawing ? <Loader2 size={15} className="animate-spin" /> : null}
              {withdrawing
                ? progress ? `Retrait… ${progress.done}/${progress.total}` : 'Retrait…'
                : `Retirer d’eBay (${selected.length})`}
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          disabled={withdrawing}
          className="self-end px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
