import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { EbayLogo } from './EbayLogo';
import { cdnImg } from '../../lib/cdn';
import type { Card } from '../../types';

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
        setPrice((data.price ?? card.price ?? '').toString());
        setPaymentPolicyId(data.policies?.payment || '');
        setReturnPolicyId(data.policies?.return || '');
        setFulfillmentPolicyId(data.policies?.fulfillment || '');
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [card.id, card.price]);

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
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={options.length === 0}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
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
      </label>
    );
  }

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
              Publier l'annonce
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={22} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : result ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={40} style={{ color: 'var(--green)' }} />
            <p className="text-sm font-bold text-white">Annonce publiée sur eBay !</p>
            <a
              href={result.ebay_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              <ExternalLink size={14} />
              Voir l'annonce
            </a>
            <button onClick={onClose} className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Fermer</button>
          </div>
        ) : !preview?.connected ? (
          <div className="flex flex-col gap-2 py-2">
            <AlertCircle size={20} style={{ color: 'var(--red)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Connecte d'abord ton compte eBay depuis l'onglet « eBay » du menu.
            </p>
          </div>
        ) : (
          <>
            {missingPolicies.length > 0 && (
              <div className="rounded-xl px-3 py-2.5 text-xs leading-relaxed" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
                Configure d'abord tes options de vente sur eBay (paiement/retour/livraison manquant : {missingPolicies.join(', ')}) avant de pouvoir publier.
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Titre ({title.length}/80)
              </label>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                rows={2}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {preview.category && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Catégorie eBay : <span style={{ color: 'var(--text-secondary)' }}>{preview.category.name}</span>
              </p>
            )}

            {preview.policies?.configured && (
              <div className="rounded-2xl p-3 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-black text-white">Conditions eBay</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Choisis les policies du compte vendeur pour cette annonce.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {renderPolicySelect('Paiement', paymentPolicyId, setPaymentPolicyId, policyOptions?.payment)}
                  {renderPolicySelect('Livraison', fulfillmentPolicyId, setFulfillmentPolicyId, policyOptions?.fulfillment)}
                  {renderPolicySelect('Retours', returnPolicyId, setReturnPolicyId, policyOptions?.return)}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Description ({description.length}/5000)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
                rows={11}
                className="w-full rounded-xl px-3 py-2 text-sm leading-relaxed outline-none resize-y min-h-[220px]"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Prix (€)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {preview.extra_image_url && (
              <label className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <input
                  type="checkbox"
                  checked={includeExtraImage}
                  onChange={(e) => setIncludeExtraImage(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                <img src={cdnImg(preview.extra_image_url)} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                <span className="text-sm font-bold text-white">Ajouter mon image d'annonce (3e photo)</span>
              </label>
            )}

            <div className="rounded-2xl p-3 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={allowOffers}
                  onChange={(e) => setAllowOffers(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                <span className="text-sm font-bold text-white">Autoriser les offres</span>
              </label>
              {allowOffers && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Offre minimum (€)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    required={allowOffers}
                    value={minimumOfferPrice}
                    onChange={(e) => setMinimumOfferPrice(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                  <p className="text-[11px] leading-relaxed" style={{ color: invalidMinimumOffer ? 'var(--red)' : 'var(--text-muted)' }}>
                    eBay refusera automatiquement les offres sous ce montant. Le minimum doit rester inférieur au prix.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>
            )}

            <button
              onClick={publish}
              disabled={publishing || missingPolicies.length > 0 || missingPolicySelection || invalidMinimumOffer || !title.trim() || !description.trim() || !(parsedPrice > 0)}
              className="py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              {publishing ? <Loader2 size={16} className="animate-spin" /> : <EbayLogo width={32} height={13} mono="#09090B" />}
              {publishing ? 'Publication…' : 'Publier sur eBay'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
