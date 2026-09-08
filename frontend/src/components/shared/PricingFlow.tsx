import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, SkipForward, X } from 'lucide-react';
import type { Card } from '../../types';
import { useUpdateCard } from '../../hooks/useCards';
import { calculateEbayPrice } from '../../lib/marketplacePricing';
import { cdnImg } from '../../lib/cdn';
import { EbaySoldItems } from './EbaySoldItems';

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
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-6 backdrop-blur-xl">
        <div className="rounded-3xl border border-white/10 bg-[var(--bg-card)] p-8 text-center">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">Toutes les cartes de cette file sont traitées.</p>
          <button onClick={onClose} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-black text-black">Retour à la Collection</button>
        </div>
      </div>
    );
  }

  const query = buildPriceSearchText(card);
  const rawSoldUrl = `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(query).replace(/%20/g, '+')}&LH_Sold=1&LH_Complete=1&LH_PrefLoc=2`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[var(--bg-primary)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/30 px-4 py-3 backdrop-blur-xl sm:px-6">
        <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10"><X size={18} /></button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-white">Pricing en chaîne</h2>
          <p className="text-[11px] text-[var(--text-muted)]">{index + 1} / {queue.length} · {card.player || 'Joueur inconnu'}</p>
        </div>
        <div className="hidden items-center gap-2 text-[10px] text-white/35 md:flex"><span>← → naviguer</span><span>·</span><span>P prix</span><span>·</span><span>Échap fermer</span></div>
      </header>

      <div className="h-1 shrink-0 bg-white/5"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${((index + 1) / queue.length) * 100}%` }} /></div>

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(260px,0.8fr)_minmax(340px,1.25fr)_minmax(280px,0.75fr)] lg:overflow-hidden">
        <section className="border-b border-white/10 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-6">
          <div className="mx-auto grid max-w-lg grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
            {[card.image_front_url, card.image_back_url].map((url, side) => (
              <div key={side} className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                {url ? <img src={cdnImg(url)} alt={side === 0 ? 'Recto' : 'Verso'} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-white/25">{side === 0 ? 'Pas de recto' : 'Pas de verso'}</div>}
              </div>
            ))}
          </div>
          <div className="mx-auto mt-4 max-w-lg space-y-1">
            <h3 className="text-lg font-black text-white">{card.player || 'Joueur inconnu'}</h3>
            <p className="text-xs text-[var(--text-secondary)]">{[card.year, card.brand, card.set_name].filter(Boolean).join(' · ')}</p>
            <p className="text-xs text-[var(--text-muted)]">{[card.insert_name, card.parallel_name, card.card_number ? `#${card.card_number}` : null, card.numbered].filter(Boolean).join(' · ')}</p>
          </div>
        </section>

        <section className="border-b border-white/10 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-white/50">Comparables eBay</h3>
              <a href={rawSoldUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent)]">eBay Sold brut <ExternalLink size={12} /></a>
            </div>
            <EbaySoldItems key={card.id} query={query} imageUrl={card.image_front_url} currentPrice={validPrice ? parsedPrice : null} onApplyPrice={(price) => setVintedPrice(price.toString())} cardId={card.id} autoFetch />
          </div>
        </section>

        <aside className="p-4 lg:overflow-y-auto sm:p-6">
          <div className="mx-auto max-w-md space-y-4 lg:sticky lg:top-0">
            {card.ebay_url && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">Cette carte a déjà une annonce eBay. Le pricing ne la modifiera pas.</div>}
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider text-white/50">Prix Vinted</span>
              <div className="relative"><input ref={priceRef} autoFocus type="text" inputMode="decimal" value={vintedPrice} onChange={(event) => setVintedPrice(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveAndNext(); }} placeholder="0,00" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 pr-12 text-3xl font-black text-white outline-none focus:border-[var(--accent)]" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-black text-white/30">€</span></div>
            </label>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-white/35">Prix eBay calculé</p><p className="mt-1 text-2xl font-black text-[var(--accent)]">{ebayPrice != null ? `${ebayPrice} €` : '—'}</p></div>
            {error && <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
            <button onClick={() => void saveAndNext()} disabled={!validPrice || updateCard.isPending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-4 text-sm font-black text-black transition active:scale-[0.98] disabled:opacity-40"><Check size={18} />{updateCard.isPending ? 'Enregistrement…' : 'Enregistrer + suivante'}</button>
            <button onClick={() => move(1)} disabled={index >= queue.length - 1 || updateCard.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/70 disabled:opacity-30"><SkipForward size={15} />Ignorer</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => move(-1)} disabled={index === 0 || updateCard.isPending} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-white/60 disabled:opacity-25"><ArrowLeft size={14} />Précédente</button>
              <button onClick={() => move(1)} disabled={index >= queue.length - 1 || updateCard.isPending} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-white/60 disabled:opacity-25">Suivante<ArrowRight size={14} /></button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
