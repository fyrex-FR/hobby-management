import { useState } from 'react';
import { AlertTriangle, HandCoins, Loader2, X } from 'lucide-react';
import { Modal, Notice } from '../ui';
import { formatEuro, offerSuggestions, parseAmount } from '../../lib/salon';
import type { Card } from '../../types';
import { Thumb } from './parts';
import { cardMeta } from './cardText';

const PSEUDO_KEY = 'cv-salon-pseudo';
const readPseudo = () => { try { return localStorage.getItem(PSEUDO_KEY) ?? ''; } catch { return ''; } };

type Choice = { kind: 'none' } | { kind: 'preset'; amount: number } | { kind: 'custom' };

/**
 * Panier du visiteur. Une seule offre, sur le lot entier (c'est comme ça
 * qu'on négocie en salon), proposée en un geste : -10 / -15 / -20 % ou un
 * montant libre. Rien n'est obligatoire à part les cartes.
 */
export function SalonCartSheet({ open, onClose, cards, blocked, editingCode, keptDeal = null, holdMinutes, sending, error, onRemove, onSubmit }: {
  open: boolean;
  onClose: () => void;
  cards: Card[];
  blocked: Card[];
  editingCode: string | null;
  /** Prix déjà négocié + nouvelles cartes au prix affiché : repris comme offre en modifiant la réservation. */
  keptDeal?: number | null;
  holdMinutes: number;
  sending: boolean;
  error: string | null;
  onRemove: (id: string) => void;
  onSubmit: (p: { offer: number | null; pseudo: string }) => void;
}) {
  const [choice, setChoice] = useState<Choice>(keptDeal != null ? { kind: 'custom' } : { kind: 'none' });
  const [custom, setCustom] = useState(keptDeal != null ? String(keptDeal).replace('.', ',') : '');
  const [pseudo, setPseudo] = useState(readPseudo);
  const total = Math.round(cards.reduce((s, c) => s + (c.price ?? 0), 0) * 100) / 100;
  const suggestions = offerSuggestions(total);

  const customValue = parseAmount(custom);
  const offer = choice.kind === 'preset' ? choice.amount : choice.kind === 'custom' ? customValue : null;
  const offerValid = offer == null || (offer > 0 && offer < total);
  const presetGone = choice.kind === 'preset' && !suggestions.some((s) => s.amount === choice.amount);
  const effectiveOffer = presetGone ? null : offer;

  function submit() {
    try { localStorage.setItem(PSEUDO_KEY, pseudo.trim()); } catch { /* stockage indisponible */ }
    onSubmit({ offer: effectiveOffer, pseudo: pseudo.trim() });
  }

  const cta = editingCode
    ? (effectiveOffer ? `Mettre à jour et proposer ${formatEuro(effectiveOffer)}` : 'Mettre à jour ma réservation')
    : (effectiveOffer ? `Réserver et proposer ${formatEuro(effectiveOffer)}` : `Réserver · ${formatEuro(total)}`);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingCode ? `Réservation ${editingCode}` : 'Mon panier'}
      subtitle={`${cards.length} carte${cards.length > 1 ? 's' : ''} · ${formatEuro(total)}`}
      size="md"
      dismissible={!sending}
      footer={
        <div className="w-full space-y-2">
          <button className="ui-btn ui-btn-primary ui-btn-lg w-full" disabled={sending || !cards.length || !offerValid} onClick={submit}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : null}
            {cta}
          </button>
          <p className="text-center text-xs text-[var(--text-muted)]">Cartes bloquées {holdMinutes} min pour toi. Tu paies au stand.</p>
        </div>
      }
      bodyClassName="space-y-5"
    >
      {error && <Notice tone="error" icon={AlertTriangle}>{error}</Notice>}

      {blocked.length > 0 && (
        <Notice tone="warning" icon={AlertTriangle}>
          <p className="font-medium">{blocked.length > 1 ? `${blocked.length} cartes ne sont plus disponibles` : 'Une carte n\'est plus disponible'}</p>
          <p className="mt-0.5 text-[var(--text-secondary)]">{blocked.map((c) => c.player ?? 'Carte').join(', ')}</p>
          <button className="mt-1.5 text-xs font-semibold underline" onClick={() => blocked.forEach((c) => onRemove(c.id))}>Retirer du panier</button>
        </Notice>
      )}

      {!cards.length ? (
        <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">Ton panier est vide.</p>
      ) : (
        <ul className="-my-1 divide-y divide-[var(--border)]">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <Thumb url={c.image_front_url} className="h-14 w-10 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{c.player ?? 'Carte'}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">{cardMeta(c)}</p>
              </div>
              <span className="tabular text-[13px] font-semibold text-[var(--price)]">{formatEuro(c.price ?? 0)}</span>
              <button className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8" onClick={() => onRemove(c.id)} aria-label={`Retirer ${c.player ?? 'la carte'}`}>
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {cards.length > 0 && suggestions.length > 0 && (
        <section className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <div className="flex items-center gap-2">
            <HandCoins size={16} className="text-[var(--accent)]" />
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Faire une offre pour {cards.length > 1 ? 'le lot' : 'cette carte'}</h3>
            <span className="text-xs text-[var(--text-muted)]">facultatif</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="ui-chip" data-active={choice.kind === 'none' || presetGone} onClick={() => setChoice({ kind: 'none' })}>Prix affiché</button>
            {suggestions.map((s) => (
              <button
                key={s.pct}
                className="ui-chip"
                data-active={choice.kind === 'preset' && choice.amount === s.amount}
                onClick={() => setChoice({ kind: 'preset', amount: s.amount })}
              >
                {formatEuro(s.amount)}<span className="count">−{s.pct} %</span>
              </button>
            ))}
            <button className="ui-chip" data-active={choice.kind === 'custom'} onClick={() => setChoice({ kind: 'custom' })}>Autre</button>
          </div>
          {choice.kind === 'custom' && (
            <div>
              <div className="relative">
                <input
                  className="ui-input pr-8 text-[15px]"
                  inputMode="decimal"
                  autoFocus={keptDeal == null}
                  placeholder={`Ton prix pour ${cards.length > 1 ? 'les ' + cards.length + ' cartes' : 'la carte'}`}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)]">€</span>
              </div>
              {custom && !offerValid && <p className="mt-1 text-xs text-[var(--red)]">L'offre doit être inférieure à {formatEuro(total)}.</p>}
            </div>
          )}
          {keptDeal != null && choice.kind === 'custom' && customValue === keptDeal && (
            <p className="text-xs text-[var(--text-secondary)]">On reprend ton prix négocié, plus les nouvelles cartes au prix affiché.</p>
          )}
          {effectiveOffer != null && offerValid && (
            <p className="text-xs text-[var(--text-secondary)]">
              Tu proposes <strong className="text-[var(--text-primary)]">{formatEuro(effectiveOffer)}</strong> au lieu de {formatEuro(total)}. Le vendeur répond depuis son téléphone, tu vois sa réponse ici.
            </p>
          )}
        </section>
      )}

      {cards.length > 0 && (
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium text-[var(--text-secondary)]">Ton prénom <span className="text-[var(--text-muted)]">(facultatif, pour que le vendeur t'appelle)</span></span>
          <input className="ui-input" value={pseudo} maxLength={60} autoComplete="given-name" onChange={(e) => setPseudo(e.target.value)} />
        </label>
      )}
    </Modal>
  );
}
