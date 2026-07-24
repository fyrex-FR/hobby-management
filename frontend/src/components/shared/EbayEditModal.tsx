import { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { EbayLogo } from './EbayLogo';
import type { Card } from '../../types';

interface PreviewData {
  connected: boolean;
  title?: string;
  description?: string;
  price?: number | null;
}

interface Props {
  card: Card;
  onClose: () => void;
  onSaved?: () => void;
}

/** Modifie une annonce eBay déjà en ligne (titre / description / prix). Se
 * pré-remplit via le même preview que la publication, puis pousse les
 * changements sur l'offre existante (PUT /ebay/selling/listing/{id}). */
export function EbayEditModal({ card, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PreviewData>(`/ebay/selling/preview/${card.id}`)
      .then((data) => {
        if (cancelled) return;
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
        setPrice((card.price ?? data.price ?? '').toString());
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [card.id, card.price]);

  const parsedPrice = parseFloat(price);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/ebay/selling/listing/${card.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, description, price: parsedPrice }),
      });
      qc.invalidateQueries({ queryKey: ['cards'] });
      setDone(true);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
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
              Modifier l'annonce
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
        ) : done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={40} style={{ color: 'var(--green)' }} />
            <p className="text-sm font-bold text-white">Annonce mise à jour !</p>
            {card.ebay_url && (
              <a
                href={card.ebay_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{ background: 'var(--accent)', color: '#09090B' }}
              >
                <ExternalLink size={14} />
                Voir l'annonce
              </a>
            )}
            <button onClick={onClose} className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Fermer</button>
          </div>
        ) : (
          <>
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

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Description ({description.length}/5000)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
                rows={10}
                className="w-full rounded-xl px-3 py-2 text-sm leading-relaxed outline-none resize-y min-h-[200px]"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

            <button
              onClick={save}
              disabled={saving || !title.trim() || !(parsedPrice > 0)}
              className="py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
