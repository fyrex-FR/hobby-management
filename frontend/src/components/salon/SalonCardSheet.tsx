import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ImageOff, Plus, RotateCcw } from 'lucide-react';
import { Modal } from '../ui';
import { cdnImg } from '../../lib/cdn';
import { formatEuro } from '../../lib/salon';
import type { Card } from '../../types';
import { CardTags } from './parts';
import { cardMeta, cardVariant } from './cardText';

/**
 * Fiche d'une carte. On passe à la voisine (dans l'ordre de la grille filtrée)
 * par glissement, flèches ou touches ← →, sans revenir à la liste.
 */
export function SalonCardSheet({ list, index, onIndex, onClose, inCart, unavailable, onToggle }: {
  list: Card[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  inCart: (id: string) => boolean;
  unavailable: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  const card = list[index];
  const [back, setBack] = useState(false);
  const touchX = useRef<number | null>(null);
  const prev = index > 0 ? () => { onIndex(index - 1); setBack(false); } : null;
  const next = index < list.length - 1 ? () => { onIndex(index + 1); setBack(false); } : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev?.();
      if (e.key === 'ArrowRight') next?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!card) return null;
  const img = back && card.image_back_url ? card.image_back_url : card.image_front_url;
  const taken = unavailable(card.id);
  const added = inCart(card.id);
  const variant = cardVariant(card);
  const details = [
    card.team,
    card.numbered ? `Numérotée ${card.numbered}` : null,
    card.grading_grade ? `Gradée ${`${card.grading_company ?? ''} ${card.grading_grade}`.trim()}` : null,
  ].filter(Boolean);

  return (
    <Modal
      open
      onClose={onClose}
      title={card.player ?? 'Carte'}
      subtitle={[cardMeta(card), variant].filter(Boolean).join(' · ')}
      size="md"
      footer={
        <div className="flex w-full items-center gap-3">
          <span className="tabular text-xl font-semibold text-[var(--price)]">{formatEuro(card.price ?? 0)}</span>
          <span className="flex-1" />
          {taken ? (
            <span className="text-[13px] text-[var(--text-muted)]">Réservée par un autre visiteur</span>
          ) : (
            <button className={`ui-btn ui-btn-lg ${added ? '' : 'ui-btn-primary'}`} onClick={() => onToggle(card.id)}>
              {added ? <><Check size={16} /> Dans le panier</> : <><Plus size={16} /> Ajouter au panier</>}
            </button>
          )}
        </div>
      }
    >
      <div
        className="relative mx-auto aspect-[3/4] max-h-[52dvh] select-none overflow-hidden rounded-xl bg-[var(--bg-secondary)]"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx > 50) prev?.();
          if (dx < -50) next?.();
        }}
      >
        {img
          ? <img key={img} src={cdnImg(img)} alt={card.player ?? ''} className="h-full w-full object-contain" draggable={false} />
          : <div className="flex h-full items-center justify-center text-[var(--text-muted)]"><ImageOff size={32} /></div>}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1"><CardTags card={card} /></div>
        {prev && (
          <button className="dark-scope absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15" onClick={prev} aria-label="Carte précédente">
            <ChevronLeft size={18} />
          </button>
        )}
        {next && (
          <button className="dark-scope absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15" onClick={next} aria-label="Carte suivante">
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
        <span className="tabular">{index + 1} / {list.length}</span>
        {card.image_back_url && (
          <button className="ui-btn ui-btn-sm" onClick={() => setBack((b) => !b)}><RotateCcw size={13} /> {back ? 'Voir le recto' : 'Voir le verso'}</button>
        )}
      </div>
      {(details.length > 0 || card.condition_notes) && (
        <div className="mt-3 space-y-1 text-[13px] text-[var(--text-secondary)]">
          {details.length > 0 && <p>{details.join(' · ')}</p>}
          {card.condition_notes && <p className="text-[var(--text-muted)]">{card.condition_notes}</p>}
        </div>
      )}
    </Modal>
  );
}
