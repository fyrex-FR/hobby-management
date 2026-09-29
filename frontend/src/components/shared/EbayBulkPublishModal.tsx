import { useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ImageOff, Loader2 } from 'lucide-react';
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
import { Badge, Field, Modal, Notice } from '../ui';

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
  const ebayPrice = card.ebay_price ?? card.price;
  if (ebayPrice == null || ebayPrice <= 0) return { eligible: false, reason: 'Sans prix eBay' };
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
  const [allowOffers, setAllowOffers] = useState(false);
  const [minOfferPercent, setMinOfferPercent] = useState('80');
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<EbayPublishResult[] | null>(null);
  const [error, setError] = useState('');

  const selected = eligibleCards.filter((c) => !deselected.has(c.id));
  const resultById = new Map((results ?? []).map((r) => [r.card_id, r]));
  const parsedPercent = parseFloat(minOfferPercent);
  const invalidPercent = allowOffers && !(parsedPercent >= 1 && parsedPercent < 100);

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
        const res = await publishBatch.mutateAsync({
          card_ids: slice,
          include_extra_image: hasImage && includeImage,
          allow_offers: allowOffers,
          minimum_offer_percent: allowOffers ? parsedPercent : undefined,
        });
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

  const canPublish = connected && policiesConfigured;

  return (
    <Modal
      onClose={onClose}
      icon={<EbayLogo width={48} height={19} />}
      title="Publier en masse"
      subtitle={`${cards.length} carte${cards.length > 1 ? 's' : ''} sélectionnée${cards.length > 1 ? 's' : ''}`}
      size="lg"
      dismissible={!publishing}
      footer={
        canPublish ? (
          <>
            <button onClick={onClose} disabled={publishing} className="ui-btn ui-btn-ghost">{results && !publishing ? 'Fermer' : 'Annuler'}</button>
            <button onClick={publishSelected} disabled={publishing || selected.length === 0 || invalidPercent} className="ui-btn ui-btn-primary">
              {publishing ? <Loader2 size={15} className="animate-spin" /> : <EbayLogo width={32} height={13} mono="#09090B" />}
              {publishing
                ? progress
                  ? `Publication… ${progress.done}/${progress.total}`
                  : 'Publication…'
                : `Publier la sélection (${selected.length})`}
            </button>
          </>
        ) : (
          <button onClick={onClose} className="ui-btn">Fermer</button>
        )
      }
    >
      {!connected ? (
        <Notice tone="error" icon={AlertCircle}>
          Connecte d’abord ton compte eBay depuis l’onglet « eBay » du menu.
        </Notice>
      ) : !policiesConfigured ? (
        <Notice tone="warning" icon={AlertCircle}>
          Configure d’abord tes options de vente eBay (paiement, livraison, retours) dans le centre de contrôle eBay.
        </Notice>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--text-muted)]">
            Titre, description, catégorie et mode d’envoi automatiques. Chaque carte part avec son prix déjà saisi. Décoche celles à ne pas publier.
          </p>

          {progress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Publication en cours</span>
                <span className="tabular font-medium text-[var(--text-primary)]">{progress.done} / {progress.total}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          <div className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
            {evaluated.map(({ card, eligible, reason }) => {
              const res = resultById.get(card.id);
              const checked = eligible && !deselected.has(card.id);
              const cardPrice = card.ebay_price ?? card.price;
              return (
                <label
                  key={card.id}
                  className={`flex items-center gap-3 px-3 py-2 transition-colors ${eligible ? 'cursor-pointer hover:bg-[var(--bg-elevated)]' : 'opacity-55'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!eligible || publishing || res?.status === 'published'}
                    onChange={() => toggle(card.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
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
                      {eligible ? [card.year, shippingName(cardPrice)].filter(Boolean).join(' · ') : reason}
                    </p>
                  </div>
                  {res ? (
                    <Badge tone={res.status === 'published' ? 'green' : res.status === 'skipped' ? 'neutral' : 'red'}>
                      {res.status === 'published' ? <><Check size={11} /> Publiée</> : res.status === 'skipped' ? 'Ignorée' : 'Échec'}
                    </Badge>
                  ) : eligible ? (
                    <span className="tabular shrink-0 text-[13px] font-semibold text-[var(--price)]">{formatEuro(cardPrice)}</span>
                  ) : (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">—</span>
                  )}
                </label>
              );
            })}
          </div>

          {ineligibleCount > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              {ineligibleCount} carte{ineligibleCount > 1 ? 's' : ''} non publiable{ineligibleCount > 1 ? 's' : ''} (déjà en ligne, sans photo ou sans prix) — ignorée{ineligibleCount > 1 ? 's' : ''}.
            </p>
          )}

          <div className="space-y-2">
            {hasImage && (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={includeImage}
                  disabled={publishing}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="text-[13px] font-medium text-[var(--text-primary)]">Ajouter mon image d’annonce (3e photo)</span>
              </label>
            )}

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={allowOffers}
                  disabled={publishing}
                  onChange={(e) => setAllowOffers(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="text-[13px] font-medium text-[var(--text-primary)]">Autoriser les offres</span>
              </label>
              {allowOffers && (
                <Field
                  className="mt-3 pl-7"
                  label="Refuser automatiquement sous (% du prix)"
                  error={invalidPercent ? 'Indique un pourcentage entre 1 et 99.' : undefined}
                  hint={`Les cartes du lot ayant des prix différents, le seuil est calculé sur le prix de chacune (ex. une carte à 50 € refusera sous ${(50 * parsedPercent / 100).toFixed(2)} €).`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={99}
                      value={minOfferPercent}
                      disabled={publishing}
                      onChange={(e) => setMinOfferPercent(e.target.value)}
                      className="ui-input tabular w-24"
                    />
                    <span className="text-[13px] text-[var(--text-muted)]">%</span>
                  </div>
                </Field>
              )}
            </div>
          </div>

          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}

          {results && !publishing && (
            <div className="space-y-2">
              <Notice tone={failed > 0 ? 'warning' : 'success'} icon={failed > 0 ? AlertCircle : CheckCircle2}>
                {published} publiée{published > 1 ? 's' : ''}
                {skipped > 0 ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''}` : ''}
                {failed > 0 ? ` · ${failed} échec${failed > 1 ? 's' : ''}` : ''}
              </Notice>
              {failed > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border)] px-3 py-2">
                  {(results ?? []).filter((r) => r.status === 'error').map((r) => (
                    <li key={r.card_id} className="text-xs text-[var(--red)]">
                      {(r.title || r.card_id)} — {r.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function formatEuro(v: number | null | undefined): string {
  return v == null ? '—' : euro.format(v);
}
