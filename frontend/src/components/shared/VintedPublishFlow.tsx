import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, ExternalLink, Info, Loader2, Play, RotateCcw, SkipForward } from 'lucide-react';
import type { Card } from '../../types';
import { buildVintedDraft, openVintedDraft } from '../../lib/vintedDraft';
import { VintedLogo } from './EbayLogo';
import { Modal, Notice } from '../ui';

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

  const position = queue.length ? Math.min(index + 1, queue.length) : 0;
  const progress = queue.length ? ((status === 'done' ? queue.length : index) / queue.length) * 100 : 0;
  const price = current ? current.vinted_price ?? current.price : null;

  const footer = (
    <>
      {status !== 'done' && current && <button onClick={onClose} disabled={status === 'preparing'} className="ui-btn ui-btn-ghost mr-auto">Annuler</button>}
      {(status === 'waiting' || status === 'error') && current && <button onClick={skip} className="ui-btn"><SkipForward size={15} /> Ignorer</button>}
      {status === 'error' && current && <button onClick={() => void sendCard(current)} className="ui-btn"><RotateCcw size={14} /> Réessayer</button>}
      {status === 'idle' && current && <button onClick={() => void sendCard(current)} className="ui-btn ui-btn-primary"><Play size={14} /> Démarrer</button>}
      {status === 'preparing' && <button disabled className="ui-btn ui-btn-primary"><Loader2 size={14} className="animate-spin" /> Préparation…</button>}
      {status === 'error' && current && <button onClick={() => void fallback()} className="ui-btn ui-btn-primary"><ExternalLink size={14} /> Ouvrir manuellement</button>}
      {status === 'done' && <button onClick={onClose} className="ui-btn ui-btn-primary">Fermer</button>}
      {!current && status !== 'done' && <button onClick={onClose} className="ui-btn ui-btn-primary">Fermer</button>}
    </>
  );

  return (
    <Modal
      onClose={onClose}
      zIndex={120}
      icon={<VintedLogo width={55} height={16} />}
      title="Publication en chaîne"
      subtitle={queue.length ? `${queue.length} carte${queue.length > 1 ? 's' : ''} à publier sur Vinted` : 'Aucune carte publiable'}
      dismissible={status !== 'preparing'}
      footer={footer}
    >
      <div className="space-y-4">
        {queue.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">Progression</span>
              <span className="tabular font-medium text-[var(--text-primary)]">{position} / {queue.length}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {excludedCount > 0 && (
          <Notice tone="warning" icon={AlertTriangle}>
            {excludedCount} exclue{excludedCount > 1 ? 's' : ''} : déjà publiée, sans prix ou sans photo.
          </Notice>
        )}

        {current && status !== 'done' && (
          <div className="flex flex-col gap-4 sm:flex-row">
            {current.image_front_url && (
              <div className="mx-auto aspect-[3/4] w-44 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] sm:mx-0 sm:w-40">
                <img src={current.image_front_url} alt="" className="h-full w-full object-contain" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{current.player || 'Carte sans joueur'}</p>
              <p className="text-[13px] text-[var(--text-secondary)]">{[current.year, current.brand, current.set_name, current.parallel_name].filter(Boolean).join(' · ')}</p>
              {price != null && <p className="tabular pt-2 text-2xl font-semibold text-[var(--price)]">{price.toFixed(2)} €</p>}
            </div>
          </div>
        )}

        {status === 'idle' && current && <Notice tone="info" icon={Info}>Prêt à ouvrir Vinted dans un onglet dédié.</Notice>}
        {status === 'preparing' && <Notice tone="info"><span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Préparation du brouillon…</span></Notice>}
        {status === 'waiting' && <Notice tone="info" icon={Clock}>Brouillon prêt. Vérifie l’annonce puis clique sur « Publier » dans Vinted.</Notice>}
        {status === 'done' && <Notice tone="success" icon={CheckCircle2}>File terminée, URLs enregistrées.</Notice>}
        {status === 'error' && <Notice tone="warning" icon={AlertCircle}>{error}</Notice>}
      </div>
    </Modal>
  );
}
