import { useMemo, useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import {
  matchShippingRule,
  useEbayAccountStatus,
  useEbayPublishBatch,
  useEbaySellerImage,
  useEbaySellerSetup,
  useEbayShippingRules,
} from '../../hooks/useEbayAccount';
import type { EbayPublishResult, EbayShippingRule } from '../../hooks/useEbayAccount';
import { useQueryClient } from '@tanstack/react-query';
import { EbayLogo } from './EbayLogo';
import { cdnImg } from '../../lib/cdn';
import type { Card } from '../../types';

interface Props {
  cards: Card[];
  onClose: () => void;
  onDone?: () => void;
}

interface Eligibility {
  eligible: boolean;
  reason?: string;
}

function evaluate(card: Card): Eligibility {
  if (card.ebay_url) return { eligible: false, reason: 'Déjà en ligne' };
  if (!card.image_front_url) return { eligible: false, reason: 'Photo recto manquante' };
  if (card.price == null || card.price <= 0) return { eligible: false, reason: 'Sans prix' };
  return { eligible: true };
}

const BATCH = 5;

/** Publication de masse d'une sélection de cartes (depuis la vue Collection).
 * Titre/description/catégorie auto-générés, prix déjà saisi, mode d'envoi via
 * les règles prix -> livraison. Les cartes inéligibles (déjà en ligne, sans
 * photo, sans prix) sont affichées mais non publiées. */
export function EbayBulkPublishModal({ cards, onClose, onDone }: Props) {
  const { data: status } = useEbayAccountStatus();
  const connected = Boolean(status?.connected);
  const { data: setup } = useEbaySellerSetup(connected);
  const { data: rulesData } = useEbayShippingRules();
  const { data: sellerImage } = useEbaySellerImage();
  const publishBatch = useEbayPublishBatch();
  const qc = useQueryClient();

  const rules: EbayShippingRule[] = rulesData?.rules ?? [];
  const fulfillmentOptions = setup?.policies?.options?.fulfillment ?? [];
  const policiesConfigured = Boolean(setup?.policies?.configured);
  const hasImage = Boolean(sellerImage?.extra_image_url);

  const evaluated = useMemo(() => cards.map((c) => ({ card: c, ...evaluate(c) })), [cards]);
  const eligibleCards = useMemo(() => evaluated.filter((e) => e.eligible).map((e) => e.card), [evaluated]);

  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [includeImage, setIncludeImage] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<EbayPublishResult[] | null>(null);
  const [error, setError] = useState('');

  const selected = eligibleCards.filter((c) => !deselected.has(c.id));
  const resultById = new Map((results ?? []).map((r) => [r.card_id, r]));

  function shippingName(price: number | null): string {
    const id = price != null ? matchShippingRule(rules, price) : null;
    if (!id) return 'Défaut du compte';
    return fulfillmentOptions.find((p) => p.id === id)?.name || 'Défaut du compte';
  }

  function toggle(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function publishSelected() {
    const ids = selected.map((c) => c.id);
    if (!ids.length) return;
    setPublishing(true);
    setError('');
    setResults(null);
    setProgress({ done: 0, total: ids.length });
    let all: EbayPublishResult[] = [];
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        const res = await publishBatch.mutateAsync({ card_ids: slice, include_extra_image: hasImage && includeImage });
        if ('connected' in res) {
          setError('Connecte d’abord ton compte eBay.');
          break;
        }
        all = all.concat(res.results);
        setResults(all);
        setProgress({ done: Math.min(i + BATCH, ids.length), total: ids.length });
      }
      qc.invalidateQueries({ queryKey: ['cards'] });
      onDone?.();
    } catch (e) {
      setError((e as Error).message || 'Erreur réseau pendant la publication.');
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  }

  const published = (results ?? []).filter((r) => r.status === 'published').length;
  const skipped = (results ?? []).filter((r) => r.status === 'skipped').length;
  const failed = (results ?? []).filter((r) => r.status === 'error').length;
  const ineligibleCount = evaluated.length - eligibleCards.length;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl glass border-strong shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EbayLogo width={48} height={19} />
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Publier en masse
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {!connected ? (
          <div className="flex flex-col gap-2 py-2">
            <AlertCircle size={20} style={{ color: 'var(--red)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Connecte d’abord ton compte eBay depuis l’onglet « eBay » du menu.
            </p>
          </div>
        ) : !policiesConfigured ? (
          <div className="flex flex-col gap-2 py-2">
            <AlertCircle size={20} style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Configure d’abord tes options de vente eBay (paiement, livraison, retours) dans le centre de contrôle eBay.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Titre, description, catégorie et mode d’envoi automatiques. Chaque carte part avec son prix déjà saisi. Décoche celles à ne pas publier.
            </p>

            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
              {evaluated.map(({ card, eligible, reason }) => {
                const res = resultById.get(card.id);
                const checked = eligible && !deselected.has(card.id);
                return (
                  <label
                    key={card.id}
                    className={`flex items-center gap-3 py-2 px-2.5 rounded-xl transition-colors ${eligible ? 'cursor-pointer hover:bg-white/5' : 'opacity-55'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!eligible || publishing || res?.status === 'published'}
                      onChange={() => toggle(card.id)}
                      className="w-4 h-4 accent-[var(--accent)] shrink-0"
                    />
                    {card.image_front_url ? (
                      <img src={cdnImg(card.image_front_url)} alt="" className="w-8 h-11 object-cover rounded-lg shrink-0" />
                    ) : (
                      <div className="w-8 h-11 rounded-lg shrink-0 flex items-center justify-center text-xs" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{card.player ?? '—'}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {eligible ? [card.year, shippingName(card.price)].filter(Boolean).join(' · ') : reason}
                      </p>
                    </div>
                    {res ? (
                      <span
                        className="text-[11px] font-bold shrink-0"
                        style={{ color: res.status === 'published' ? 'var(--green)' : res.status === 'skipped' ? 'var(--text-muted)' : 'var(--red)' }}
                      >
                        {res.status === 'published' ? '✓ Publiée' : res.status === 'skipped' ? 'Ignorée' : 'Échec'}
                      </span>
                    ) : eligible ? (
                      <span className="text-sm font-black shrink-0" style={{ color: 'var(--accent)' }}>{card.price} €</span>
                    ) : (
                      <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </label>
                );
              })}
            </div>

            {ineligibleCount > 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {ineligibleCount} carte{ineligibleCount > 1 ? 's' : ''} non publiable{ineligibleCount > 1 ? 's' : ''} (déjà en ligne, sans photo ou sans prix) — ignorée{ineligibleCount > 1 ? 's' : ''}.
              </p>
            )}

            {hasImage && (
              <label className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <input
                  type="checkbox"
                  checked={includeImage}
                  disabled={publishing}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                <span className="text-sm font-medium text-white">Ajouter mon image d’annonce (3e photo)</span>
              </label>
            )}

            {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

            {results && !publishing && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-bold" style={{ color: 'var(--green)' }}>
                  ✅ {published} publiée{published > 1 ? 's' : ''}
                  {skipped > 0 ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''}` : ''}
                  {failed > 0 ? ` · ${failed} échec${failed > 1 ? 's' : ''}` : ''}
                </p>
                {failed > 0 && (
                  <ul className="flex flex-col gap-0.5 max-h-32 overflow-y-auto rounded-lg px-2 py-1.5" style={{ background: 'rgba(239,68,68,0.06)' }}>
                    {(results ?? []).filter((r) => r.status === 'error').map((r) => (
                      <li key={r.card_id} className="text-[11px]" style={{ color: 'var(--red)' }}>
                        {(r.title || r.card_id)} — {r.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              onClick={publishSelected}
              disabled={publishing || selected.length === 0}
              className="py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              {publishing ? <Loader2 size={16} className="animate-spin" /> : <EbayLogo width={32} height={13} mono="#09090B" />}
              {publishing
                ? progress
                  ? `Publication… ${progress.done}/${progress.total}`
                  : 'Publication…'
                : `Publier la sélection (${selected.length})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
