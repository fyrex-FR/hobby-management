import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { EbayLogo } from './EbayLogo';
import type { Card } from '../../types';

interface PreviewData {
  connected: boolean;
  title?: string;
  category?: { id: string; name: string } | null;
  policies?: { payment: string | null; return: string | null; fulfillment: string | null; configured: boolean };
  price?: number | null;
  marketplace_id?: string;
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
  const [price, setPrice] = useState('');
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
        setPrice((data.price ?? card.price ?? '').toString());
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [card.id, card.price]);

  async function publish() {
    setPublishing(true);
    setError('');
    try {
      const data = await apiFetch<{ published: boolean; ebay_url: string }>(`/ebay/selling/publish/${card.id}`, {
        method: 'POST',
        body: JSON.stringify({ title, price: parseFloat(price) }),
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

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl glass border-strong shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
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

            {error && (
              <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>
            )}

            <button
              onClick={publish}
              disabled={publishing || missingPolicies.length > 0 || !title.trim() || !(parseFloat(price) > 0)}
              className="py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              {publishing ? <Loader2 size={16} className="animate-spin" /> : <EbayLogo width={32} height={13} />}
              {publishing ? 'Publication…' : 'Publier sur eBay'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
