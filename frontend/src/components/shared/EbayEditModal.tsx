import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Check, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { EbayLogo } from './EbayLogo';
import type { Card } from '../../types';
import { Field, Modal, Notice, Spinner } from '../ui';

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
        setPrice((card.ebay_price ?? data.price ?? card.price ?? '').toString());
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [card.id, card.ebay_price, card.price]);

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

  let footer: ReactNode = null;
  if (done) {
    footer = (
      <>
        <button onClick={onClose} className="ui-btn ui-btn-ghost">Fermer</button>
        {card.ebay_url && (
          <a href={card.ebay_url} target="_blank" rel="noreferrer" className="ui-btn ui-btn-primary">
            <ExternalLink size={14} />
            Voir l'annonce
          </a>
        )}
      </>
    );
  } else if (!loading) {
    footer = (
      <>
        <button onClick={onClose} disabled={saving} className="ui-btn ui-btn-ghost">Annuler</button>
        <button onClick={save} disabled={saving || !title.trim() || !(parsedPrice > 0)} className="ui-btn ui-btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>
      </>
    );
  }

  return (
    <Modal
      onClose={onClose}
      icon={<EbayLogo width={48} height={19} />}
      title="Modifier l'annonce"
      subtitle={[card.player, card.year, card.set_name].filter(Boolean).join(' · ') || undefined}
      size="lg"
      dismissible={!saving}
      footer={footer}
    >
      {loading ? (
        <Spinner label="Chargement de l'annonce…" />
      ) : done ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 size={36} className="text-[var(--green)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Annonce mise à jour</p>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label={<span className="flex justify-between"><span>Titre</span><span className="tabular text-[var(--text-muted)]">{title.length}/80</span></span>}>
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

          <Field label={<span className="flex justify-between"><span>Description</span><span className="tabular text-[var(--text-muted)]">{description.length}/5000</span></span>}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              rows={10}
              className="ui-textarea min-h-[200px]"
            />
          </Field>

          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
        </div>
      )}
    </Modal>
  );
}
