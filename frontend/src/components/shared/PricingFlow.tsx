import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, Loader2, SkipForward, X } from 'lucide-react';
import type { Card } from '../../types';
import { useUpdateCard } from '../../hooks/useCards';
import { calculateEbayPrice } from '../../lib/marketplacePricing';
import { cdnImg } from '../../lib/cdn';
import { EbaySoldItems } from './EbaySoldItems';
import { EbayLogo } from './EbayLogo';
import { EmptyState, Field, Modal, Notice } from '../ui';

function buildPriceSearchText(card: Card): string {
  return [
    card.player,
    card.year,
    card.set_name || card.brand,
    card.card_number ? `#${card.card_number}` : null,
    card.insert_name,
    card.parallel_name,
    card.numbered,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

interface Props {
  cards: Card[];
  onClose: () => void;
}

export function PricingFlow({ cards, onClose }: Props) {
  const [queue] = useState(() => cards); // snapshot volontaire de la file au moment de l'ouverture
  const [index, setIndex] = useState(0);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const priceRef = useRef<HTMLInputElement>(null);
  const updateCard = useUpdateCard();
  const card = queue[index] ?? null;
  const vintedPrice = card
    ? draftPrices[card.id] ?? card.vinted_price?.toString() ?? card.price?.toString() ?? ''
    : '';
  const parsedPrice = Number(vintedPrice.replace(',', '.'));
  const validPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;
  const ebayPrice = validPrice ? calculateEbayPrice({ vintedPrice: parsedPrice }).ebayPrice : null;

  const setVintedPrice = useCallback((value: string) => {
    if (!card) return;
    setDraftPrices((current) => ({ ...current, [card.id]: value }));
  }, [card]);

  const move = useCallback((delta: number) => {
    setIndex((value) => Math.max(0, Math.min(queue.length - 1, value + delta)));
    setError('');
    window.setTimeout(() => priceRef.current?.focus(), 0);
  }, [queue.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === 'Escape') onClose();
      if (!editing && event.key.toLowerCase() === 'p') priceRef.current?.focus();
      if (!editing && event.key === 'ArrowLeft') move(-1);
      if (!editing && event.key === 'ArrowRight') move(1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move, onClose]);

  async function saveAndNext() {
    if (!card || !validPrice || ebayPrice == null) return;
    setError('');
    try {
      await updateCard.mutateAsync({
        id: card.id,
        price: parsedPrice,
        vinted_price: parsedPrice,
        ebay_price: ebayPrice,
        status: 'a_vendre',
      });
      if (index < queue.length - 1) move(1);
      else onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    }
  }

  if (!card) {
    return (
      <Modal onClose={onClose} size="sm" zIndex={70} footer={<button onClick={onClose} className="ui-btn ui-btn-primary">Retour à la Collection</button>}>
        <EmptyState icon={CheckCircle2} title="File terminée" description="Toutes les cartes de cette file sont traitées." />
      </Modal>
    );
  }

  const query = buildPriceSearchText(card);
  const rawSoldUrl = `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(query).replace(/%20/g, '+')}&LH_Sold=1&LH_Complete=1&LH_PrefLoc=2`;
  const progress = ((index + 1) / queue.length) * 100;
  const details = [card.insert_name, card.parallel_name, card.card_number ? `#${card.card_number}` : null, card.numbered].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[var(--bg-primary)]" role="dialog" aria-modal="true" aria-label="Pricing en chaîne">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 sm:px-6">
        <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon" aria-label="Fermer"><X size={18} /></button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">Pricing en chaîne</h2>
          <p className="truncate text-xs text-[var(--text-muted)]">
            <span className="tabular font-medium text-[var(--text-secondary)]">{index + 1} / {queue.length}</span> · {card.player || 'Joueur inconnu'}
          </p>
        </div>
        <div className="hidden items-center gap-3 text-[11px] text-[var(--text-muted)] md:flex">
          <span><Kbd>←</Kbd> <Kbd>→</Kbd> naviguer</span>
          <span><Kbd>P</Kbd> prix</span>
          <span><Kbd>Entrée</Kbd> enregistrer</span>
          <span><Kbd>Échap</Kbd> fermer</span>
        </div>
      </header>

      <div className="h-0.5 shrink-0 bg-[var(--bg-elevated)]" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index + 1}>
        <div className="h-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(260px,0.8fr)_minmax(340px,1.25fr)_minmax(280px,0.75fr)] lg:overflow-hidden">
        <section className="border-b border-[var(--border)] p-4 sm:p-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mx-auto grid max-w-lg grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
            {[card.image_front_url, card.image_back_url].map((url, side) => (
              <div key={side} className="aspect-[3/4] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                {url ? (
                  <img src={cdnImg(url)} alt={side === 0 ? 'Recto' : 'Verso'} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">{side === 0 ? 'Pas de recto' : 'Pas de verso'}</div>
                )}
              </div>
            ))}
          </div>
          <div className="mx-auto mt-4 max-w-lg space-y-1">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{card.player || 'Joueur inconnu'}</h3>
            <p className="text-[13px] text-[var(--text-secondary)]">{[card.year, card.brand, card.set_name].filter(Boolean).join(' · ')}</p>
            {details && <p className="text-xs text-[var(--text-muted)]">{details}</p>}
          </div>
        </section>

        <section className="border-b border-[var(--border)] p-4 sm:p-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Comparables eBay</h3>
              <a href={rawSoldUrl} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--accent)]">
                eBay Sold brut <ExternalLink size={12} />
              </a>
            </div>
            <EbaySoldItems key={card.id} query={query} imageUrl={card.image_front_url} currentPrice={validPrice ? parsedPrice : null} onApplyPrice={(price) => setVintedPrice(price.toString())} cardId={card.id} autoFetch />
          </div>
        </section>

        <aside className="p-4 sm:p-6 lg:overflow-y-auto">
          <div className="mx-auto max-w-md space-y-4 lg:sticky lg:top-0">
            {card.ebay_url && <Notice tone="warning" icon={AlertTriangle}>Cette carte a déjà une annonce eBay. Le pricing ne la modifiera pas.</Notice>}
            <Field label="Prix Vinted" hint="Entrée pour enregistrer et passer à la suivante">
              <div className="relative">
                <input
                  ref={priceRef}
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={vintedPrice}
                  onChange={(event) => setVintedPrice(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void saveAndNext(); }}
                  placeholder="0,00"
                  className="ui-input tabular h-14 pr-10 text-2xl font-semibold"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-[var(--text-muted)]">€</span>
              </div>
            </Field>
            <div className="ui-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]"><EbayLogo width={30} height={12} /> Prix eBay calculé</p>
              <p className="tabular mt-1 text-2xl font-semibold text-[var(--accent)]">{ebayPrice != null ? `${ebayPrice} €` : '—'}</p>
            </div>
            {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
            <button onClick={() => void saveAndNext()} disabled={!validPrice || updateCard.isPending} className="ui-btn ui-btn-primary ui-btn-lg w-full">
              {updateCard.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {updateCard.isPending ? 'Enregistrement…' : 'Enregistrer + suivante'}
            </button>
            <button onClick={() => move(1)} disabled={index >= queue.length - 1 || updateCard.isPending} className="ui-btn w-full"><SkipForward size={15} />Ignorer</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => move(-1)} disabled={index === 0 || updateCard.isPending} className="ui-btn ui-btn-ghost"><ArrowLeft size={14} />Précédente</button>
              <button onClick={() => move(1)} disabled={index >= queue.length - 1 || updateCard.isPending} className="ui-btn ui-btn-ghost">Suivante<ArrowRight size={14} /></button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-1 font-sans text-[11px] text-[var(--text-secondary)]">{children}</kbd>;
}
