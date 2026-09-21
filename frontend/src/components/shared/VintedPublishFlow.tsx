import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, SkipForward, X } from 'lucide-react';
import type { Card } from '../../types';
import { buildVintedDraft, openVintedDraft } from '../../lib/vintedDraft';
import { VintedLogo } from './EbayLogo';

type FlowStatus = 'idle' | 'preparing' | 'waiting' | 'done' | 'error';

export function VintedPublishFlow({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const [queue] = useState(() => cards.filter(
    (card) => !card.vinted_url && Boolean(card.image_front_url) && (card.vinted_price ?? card.price ?? 0) > 0,
  ));
  const excludedCount = cards.length - queue.length;
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<FlowStatus>('idle');
  const [error, setError] = useState('');
  const timeoutRef = useRef<number | null>(null);
  const current = queue[index];

  const clearBridgeTimeout = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const sendCard = useCallback(async (card: Card) => {
    setStatus('preparing');
    setError('');
    try {
      const draft = await buildVintedDraft(card);
      window.postMessage({ source: 'cardvaults-app', type: 'VINTED_QUEUE_DRAFT', draft }, window.location.origin);
      clearBridgeTimeout();
      timeoutRef.current = window.setTimeout(() => {
        setStatus('error');
        setError('Extension CardVaults absente ou à recharger (version 2.7.0 requise).');
      }, 2500);
    } catch (cause) {
      setStatus('error');
      setError((cause as Error).message || 'Impossible de préparer la carte.');
    }
  }, [clearBridgeTimeout]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== 'cardvaults-extension') return;
      if (message.cardId && current && message.cardId !== current.id) return;
      if (message.type === 'VINTED_QUEUE_ACCEPTED') {
        clearBridgeTimeout();
        setStatus('waiting');
      } else if (message.type === 'VINTED_QUEUE_ERROR') {
        clearBridgeTimeout();
        setStatus('error');
        setError(message.error || 'Le brouillon Vinted a échoué.');
      } else if (message.type === 'VINTED_QUEUE_PUBLISHED') {
        clearBridgeTimeout();
        queryClient.invalidateQueries({ queryKey: ['cards'] });
        if (index + 1 >= queue.length) {
          setStatus('done');
        } else {
          const nextIndex = index + 1;
          setIndex(nextIndex);
          void sendCard(queue[nextIndex]);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clearBridgeTimeout, current, index, queryClient, queue, sendCard]);

  useEffect(() => () => clearBridgeTimeout(), [clearBridgeTimeout]);

  async function fallback() {
    if (!current) return;
    setStatus('preparing');
    try {
      openVintedDraft(await buildVintedDraft(current));
      setStatus('error');
      setError('Mode manuel ouvert : colle ensuite l’URL dans la fiche.');
    } catch (cause) {
      setStatus('error');
      setError((cause as Error).message);
    }
  }

  function skip() {
    clearBridgeTimeout();
    if (index + 1 >= queue.length) setStatus('done');
    else {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      void sendCard(queue[nextIndex]);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[var(--bg-card)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><VintedLogo width={55} height={16} /><h2 className="text-base font-black text-white">Publication en chaîne</h2></div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{queue.length ? `${Math.min(index + 1, queue.length)} / ${queue.length}` : 'Aucune carte publiable'}</p>
            {excludedCount > 0 && <p className="mt-1 text-[11px] text-amber-300/80">{excludedCount} exclue{excludedCount > 1 ? 's' : ''} : déjà publiée, sans prix ou sans photo.</p>}
          </div>
          <button onClick={onClose} className="rounded-xl bg-white/5 p-2 text-white/70 hover:bg-white/10"><X size={18} /></button>
        </div>

        {current && status !== 'done' && (
          <div className="mt-6 flex gap-4 rounded-2xl bg-white/5 p-4">
            {current.image_front_url && <img src={current.image_front_url} alt="" className="h-24 w-20 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{current.player || 'Carte sans joueur'}</p>
              <p className="mt-1 text-xs text-white/55">{[current.year, current.brand, current.set_name, current.parallel_name].filter(Boolean).join(' · ')}</p>
              <p className="mt-3 text-sm font-black text-[var(--accent)]">{(current.vinted_price ?? current.price)?.toFixed(2)} €</p>
            </div>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-white/10 p-4 text-sm text-white/75">
          {status === 'idle' && 'Prêt à ouvrir Vinted dans un onglet dédié.'}
          {status === 'preparing' && <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Préparation du brouillon…</span>}
          {status === 'waiting' && 'Brouillon prêt. Vérifie l’annonce puis clique sur « Publier » dans Vinted.'}
          {status === 'done' && <span className="flex items-center gap-2 text-green-300"><CheckCircle2 size={17} /> File terminée, URLs enregistrées.</span>}
          {status === 'error' && <span className="flex items-start gap-2 text-amber-300"><AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}</span>}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {status === 'idle' && current && <button onClick={() => void sendCard(current)} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-black text-black">Démarrer</button>}
          {(status === 'waiting' || status === 'error') && current && <button onClick={skip} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/75"><SkipForward size={15} /> Ignorer</button>}
          {status === 'error' && current && <button onClick={() => void sendCard(current)} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white">Réessayer</button>}
          {status === 'error' && current && <button onClick={() => void fallback()} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-black text-black">Ouvrir manuellement</button>}
          {status === 'done' && <button onClick={onClose} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-black text-black">Fermer</button>}
        </div>
      </div>
    </div>
  );
}
