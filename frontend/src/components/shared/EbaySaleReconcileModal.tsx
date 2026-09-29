import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, ExternalLink, ImageOff, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { useUpdateCard } from '../../hooks/useCards';
import { EbayLogo, VintedLogo } from './EbayLogo';
import { cdnImg } from '../../lib/cdn';
import { ebayToWithdraw, vintedToRemove } from '../../lib/saleReconcile';
import type { Card } from '../../types';
import { EmptyState, Modal, Notice } from '../ui';

interface Props {
  cards: Card[];
  onClose: () => void;
}

function Row({ card, right }: { card: Card; right: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {card.image_front_url ? (
        <img src={cdnImg(card.image_front_url)} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <ImageOff size={14} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{card.player ?? '—'}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">
          {[card.year, card.set_name].filter(Boolean).join(' · ')}
        </p>
      </div>
      {right}
    </div>
  );
}

function SectionHead({ logo, count, children }: { logo: ReactNode; count: number; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        {logo}
        <span>Encore en ligne</span>
        <span className="tabular text-xs font-normal text-[var(--text-muted)]">{count}</span>
      </h3>
      <p className="text-xs text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

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
    <Modal
      onClose={onClose}
      icon={<AlertTriangle size={18} className="text-[var(--accent)]" />}
      title="Ventes à finaliser"
      subtitle={total > 0 ? `${total} annonce${total > 1 ? 's' : ''} encore en ligne après une vente` : undefined}
      dismissible={!withdrawing}
      footer={
        <>
          <button onClick={onClose} disabled={withdrawing} className="ui-btn ui-btn-ghost">Fermer</button>
          {ebayCards.length > 0 && (
            <button onClick={withdrawSelected} disabled={withdrawing || selected.length === 0} className="ui-btn ui-btn-primary">
              {withdrawing ? <Loader2 size={15} className="animate-spin" /> : null}
              {withdrawing
                ? progress ? `Retrait… ${progress.done}/${progress.total}` : 'Retrait…'
                : `Retirer d’eBay (${selected.length})`}
            </button>
          )}
        </>
      }
    >
      {total === 0 ? (
        <EmptyState icon={CheckCircle2} title="Tout est à jour" description="Aucune annonce à retirer après tes ventes." />
      ) : (
        <div className="space-y-5">
          <p className="text-[13px] text-[var(--text-muted)]">
            Ces cartes sont vendues mais une annonce est encore en ligne ailleurs — risque de la vendre deux fois. Rien n'est fait automatiquement : tu valides.
          </p>

          {vintedCards.length > 0 && (
            <section className="space-y-2">
              <SectionHead logo={<VintedLogo width={44} height={12} />} count={vintedCards.length}>
                Vendues sur eBay. Vinted n’ayant pas d’API, le retrait se fait à la main : ouvre l’annonce, supprime-la, puis marque-la ici.
              </SectionHead>
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                {vintedCards.map((card) => (
                  <Row
                    key={card.id}
                    card={card}
                    right={
                      <div className="flex shrink-0 items-center gap-1.5">
                        {card.ebay_sold_price != null && (
                          <span className="tabular mr-1 text-[13px] font-semibold text-[var(--green)]">{euro.format(card.ebay_sold_price)}</span>
                        )}
                        <a href={card.vinted_url!} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-sm" title="Ouvrir l’annonce Vinted">
                          <ExternalLink size={13} /> <span className="hidden sm:inline">Ouvrir</span>
                        </a>
                        <button onClick={() => markVintedRemoved(card)} disabled={clearing === card.id} className="ui-btn ui-btn-sm">
                          {clearing === card.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          J’ai retiré
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {ebayCards.length > 0 && (
            <section className="space-y-2">
              <SectionHead logo={<EbayLogo width={34} height={13} />} count={ebayCards.length}>
                Marquées vendues ailleurs, mais toujours en vente sur eBay. Celles-ci, l’app peut les retirer.
              </SectionHead>
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                {ebayCards.map((card) => (
                  <Row
                    key={card.id}
                    card={card}
                    right={
                      <div className="flex shrink-0 items-center gap-1.5">
                        {card.price != null && (
                          <span className="tabular mr-1 text-[13px] font-semibold text-[var(--accent)]">{euro.format(card.price)}</span>
                        )}
                        <a href={card.ebay_url!} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" title="Ouvrir l’annonce eBay" aria-label="Ouvrir l’annonce eBay">
                          <ExternalLink size={13} />
                        </a>
                        <label className="flex h-8 w-8 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={!deselected.has(card.id)}
                            disabled={withdrawing}
                            onChange={() => toggle(card.id)}
                            className="h-4 w-4 accent-[var(--accent)]"
                            aria-label="Retirer cette annonce"
                          />
                        </label>
                      </div>
                    }
                  />
                ))}
              </div>

              {errors.length > 0 && (
                <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border)] px-3 py-2">
                  {errors.map((e) => (
                    <li key={e.card_id} className="text-xs text-[var(--red)]">
                      {(e.player || e.card_id)} — {e.message}
                    </li>
                  ))}
                </ul>
              )}

              {doneCount > 0 && !withdrawing && (
                <Notice tone="success" icon={CheckCircle2}>
                  {doneCount} annonce{doneCount > 1 ? 's' : ''} retirée{doneCount > 1 ? 's' : ''} d’eBay
                </Notice>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
