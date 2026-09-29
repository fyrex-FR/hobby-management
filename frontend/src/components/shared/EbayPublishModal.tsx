import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Truck } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { EbayLogo } from './EbayLogo';
import { cdnImg } from '../../lib/cdn';
import { matchShippingRule } from '../../hooks/useEbayAccount';
import type { EbayShippingRule } from '../../hooks/useEbayAccount';
import type { Card } from '../../types';
import { Field, Modal, Notice, Spinner } from '../ui';

interface PreviewData {
  connected: boolean;
  title?: string;
  description?: string;
  category?: { id: string; name: string } | null;
  policies?: {
    payment: string | null;
    return: string | null;
    fulfillment: string | null;
    options?: {
      payment: PolicyOption[];
      return: PolicyOption[];
      fulfillment: PolicyOption[];
    };
    configured: boolean;
  };
  price?: number | null;
  marketplace_id?: string;
  extra_image_url?: string | null;
  shipping_rules?: EbayShippingRule[];
}

interface PolicyOption {
  id: string;
  name: string;
}

interface Props {
  card: Card;
  onClose: () => void;
  onPublished: () => void;
}

export function EbayPublishModal({ card, onClose, onPublished }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [paymentPolicyId, setPaymentPolicyId] = useState('');
  const [returnPolicyId, setReturnPolicyId] = useState('');
  const [fulfillmentPolicyId, setFulfillmentPolicyId] = useState('');
  // Tant que le vendeur n'a pas choisi manuellement l'envoi, la politique
  // d'expédition suit les règles prix -> livraison (cf. shipping_rules).
  const [fulfillmentAuto, setFulfillmentAuto] = useState(true);
  const [allowOffers, setAllowOffers] = useState(false);
  const [minimumOfferPrice, setMinimumOfferPrice] = useState('');
  const [includeExtraImage, setIncludeExtraImage] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ ebay_url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PreviewData>(`/ebay/selling/preview/${card.id}`)
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
        setPrice((data.price ?? card.ebay_price ?? card.price ?? '').toString());
        setPaymentPolicyId(data.policies?.payment || '');
        setReturnPolicyId(data.policies?.return || '');
        setFulfillmentPolicyId(data.policies?.fulfillment || '');
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [card.id, card.ebay_price, card.price]);

  // Pré-sélection auto de la politique d'expédition selon le prix saisi, via
  // les règles prix -> livraison — tant que le vendeur ne l'a pas changée à la
  // main (fulfillmentAuto). Se recalcule en direct quand il ajuste le prix.
  const shippingRules = preview?.shipping_rules ?? [];
  const autoMatchedFulfillment = matchShippingRule(shippingRules, parseFloat(price));
  useEffect(() => {
    if (fulfillmentAuto && autoMatchedFulfillment) {
      setFulfillmentPolicyId(autoMatchedFulfillment);
    }
  }, [fulfillmentAuto, autoMatchedFulfillment]);

  async function publish() {
    setPublishing(true);
    setError('');
    const trimmedMinimumOfferPrice = minimumOfferPrice.trim();
    try {
      const data = await apiFetch<{ published: boolean; ebay_url: string }>(`/ebay/selling/publish/${card.id}`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          price: parseFloat(price),
          allow_offers: allowOffers,
          minimum_offer_price: allowOffers && trimmedMinimumOfferPrice ? parseFloat(trimmedMinimumOfferPrice) : undefined,
          payment_policy_id: paymentPolicyId,
          return_policy_id: returnPolicyId,
          fulfillment_policy_id: fulfillmentPolicyId,
          include_extra_image: includeExtraImage,
        }),
      });
      setResult(data);
      onPublished();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  const missingPolicies = preview?.policies && !preview.policies.configured
    ? (['payment', 'return', 'fulfillment'] as const).filter((k) => !preview.policies?.[k])
    : [];
  const policyOptions = preview?.policies?.options;
  const missingPolicySelection = preview?.policies?.configured
    ? !paymentPolicyId || !returnPolicyId || !fulfillmentPolicyId
    : false;
  const parsedPrice = parseFloat(price);
  const parsedMinimumOffer = parseFloat(minimumOfferPrice);
  const invalidMinimumOffer = allowOffers && (
    !(parsedMinimumOffer > 0) || (parsedPrice > 0 && parsedMinimumOffer >= parsedPrice)
  );

  function renderPolicySelect(
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: PolicyOption[] = [],
  ) {
    return (
      <Field label={label}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={options.length === 0}
          className="ui-select disabled:opacity-50"
        >
          {options.length === 0 ? (
            <option value="">Aucune option trouvée</option>
          ) : (
            options.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
            ))
          )}
        </select>
      </Field>
    );
  }

  const canPublish = !(publishing || missingPolicies.length > 0 || missingPolicySelection || invalidMinimumOffer || !title.trim() || !description.trim() || !(parsedPrice > 0));

  let footer: ReactNode = null;
  if (result) {
    footer = (
      <>
        <button onClick={onClose} className="ui-btn ui-btn-ghost">Fermer</button>
        <a href={result.ebay_url} target="_blank" rel="noreferrer" className="ui-btn ui-btn-primary">
          <ExternalLink size={14} />
          Voir l'annonce
        </a>
      </>
    );
  } else if (!loading && !preview?.connected) {
    footer = <button onClick={onClose} className="ui-btn">Fermer</button>;
  } else if (!loading) {
    footer = (
      <>
        <button onClick={onClose} disabled={publishing} className="ui-btn ui-btn-ghost">Annuler</button>
        <button onClick={publish} disabled={!canPublish} className="ui-btn ui-btn-primary">
          {publishing ? <Loader2 size={15} className="animate-spin" /> : <EbayLogo width={32} height={13} mono="#09090B" />}
          {publishing ? 'Publication…' : 'Publier sur eBay'}
        </button>
      </>
    );
  }

  return (
    <Modal
      onClose={onClose}
      icon={<EbayLogo width={48} height={19} />}
      title="Publier l'annonce"
      subtitle={[card.player, card.year, card.set_name].filter(Boolean).join(' · ') || undefined}
      size="lg"
      dismissible={!publishing}
      footer={footer}
    >
      {loading ? (
        <Spinner label="Préparation de l'annonce…" />
      ) : result ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 size={36} className="text-[var(--green)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Annonce publiée sur eBay</p>
          <p className="text-[13px] text-[var(--text-muted)]">Le lien de l'annonce est enregistré sur la carte.</p>
        </div>
      ) : !preview?.connected ? (
        <div className="space-y-3">
          <Notice tone="error" icon={AlertCircle}>
            Connecte d'abord ton compte eBay depuis l'onglet « eBay » du menu.
          </Notice>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      ) : (
        <div className="space-y-5">
          {missingPolicies.length > 0 && (
            <Notice tone="error" icon={AlertCircle}>
              Configure d'abord tes options de vente sur eBay (paiement/retour/livraison manquant : {missingPolicies.join(', ')}) avant de pouvoir publier.
            </Notice>
          )}

          <Field
            label={<span className="flex justify-between"><span>Titre</span><span className="tabular text-[var(--text-muted)]">{title.length}/80</span></span>}
            hint={preview.category ? <>Catégorie eBay : <span className="text-[var(--text-secondary)]">{preview.category.name}</span></> : undefined}
          >
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              rows={2}
              className="ui-textarea min-h-0 resize-none"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Prix (€)">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="ui-input tabular"
              />
            </Field>
          </div>

          {preview.policies?.configured && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Conditions eBay</h3>
                <p className="text-xs text-[var(--text-muted)]">Choisis les policies du compte vendeur pour cette annonce.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {renderPolicySelect('Paiement', paymentPolicyId, setPaymentPolicyId, policyOptions?.payment)}
                {renderPolicySelect(
                  'Livraison',
                  fulfillmentPolicyId,
                  (v) => { setFulfillmentAuto(false); setFulfillmentPolicyId(v); },
                  policyOptions?.fulfillment,
                )}
                {renderPolicySelect('Retours', returnPolicyId, setReturnPolicyId, policyOptions?.return)}
              </div>
              {shippingRules.length > 0 && fulfillmentAuto && autoMatchedFulfillment && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--green)]">
                  <Truck size={13} />
                  Livraison choisie automatiquement selon le prix
                </p>
              )}
            </section>
          )}

          <Field label={<span className="flex justify-between"><span>Description</span><span className="tabular text-[var(--text-muted)]">{description.length}/5000</span></span>}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              rows={11}
              className="ui-textarea min-h-[220px]"
            />
          </Field>

          <div className="space-y-2">
            {preview.extra_image_url && (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={includeExtraImage}
                  onChange={(e) => setIncludeExtraImage(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <img src={cdnImg(preview.extra_image_url)} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                <span className="text-[13px] font-medium text-[var(--text-primary)]">Ajouter mon image d'annonce (3e photo)</span>
              </label>
            )}

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={allowOffers}
                  onChange={(e) => setAllowOffers(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="text-[13px] font-medium text-[var(--text-primary)]">Autoriser les offres</span>
              </label>
              {allowOffers && (
                <Field
                  className="mt-3"
                  label="Offre minimum (€)"
                  error={invalidMinimumOffer ? 'eBay refusera automatiquement les offres sous ce montant. Le minimum doit rester inférieur au prix.' : undefined}
                  hint="eBay refusera automatiquement les offres sous ce montant. Le minimum doit rester inférieur au prix."
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    required={allowOffers}
                    value={minimumOfferPrice}
                    onChange={(e) => setMinimumOfferPrice(e.target.value)}
                    className="ui-input tabular"
                  />
                </Field>
              )}
            </div>
          </div>

          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
        </div>
      )}
    </Modal>
  );
}
