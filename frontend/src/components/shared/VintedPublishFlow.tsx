import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, PanelRight, RotateCcw } from 'lucide-react';
import type { Card } from '../../types';
import { VintedLogo } from './EbayLogo';
import { Modal, Notice } from '../ui';

type SendState = 'sending' | 'sent' | 'missing' | 'empty';

const REQUIRED_VERSION = '2.11.0';

/**
 * Publication Vinted en chaîne : la sélection part dans le panneau de
 * l'extension CardVaults Scout (onglet « Publier sur Vinted »), qui remplit
 * chaque annonce sur Vinted et associe l'annonce publiée à la carte.
 */
export function VintedPublishFlow({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const eligible = useMemo(() => cards.filter((card) =>
    !card.vinted_url
    && Boolean(card.image_front_url)
    && card.status !== 'vendu' && card.status !== 'reserve' && card.status !== 'draft',
  ), [cards]);
  const excluded = cards.length - eligible.length;
  // Le panneau demande le prix de ces cartes avant de remplir l'annonce.
  const unpriced = eligible.filter((card) => !((card.vinted_price ?? card.price ?? 0) > 0)).length;
  const [state, setState] = useState<SendState>(eligible.length ? 'sending' : 'empty');
  const [sentCount, setSentCount] = useState(0);
  const timer = useRef<number | null>(null);

  // Envoi à l'extension (via collection-bridge.js) ; sans réponse sous 2,5 s,
  // elle est considérée absente.
  const postSelection = useCallback(() => {
    if (!eligible.length) return;
    window.postMessage({ source: 'cardvaults-app', type: 'VINTED_QUEUE_SET', cardIds: eligible.map((c) => c.id) }, window.location.origin);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('missing'), 2500);
  }, [eligible]);
  const retry = () => { setState('sending'); postSelection(); };

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== 'cardvaults-extension') return;
      if (message.type === 'VINTED_QUEUE_SET_ACCEPTED') {
        if (timer.current) window.clearTimeout(timer.current);
        setSentCount(message.count ?? eligible.length);
        setState('sent');
      } else if (message.type === 'VINTED_QUEUE_SET_ERROR') {
        if (timer.current) window.clearTimeout(timer.current);
        setState('missing');
      }
    }
    window.addEventListener('message', onMessage);
    postSelection();
    return () => {
      window.removeEventListener('message', onMessage);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [postSelection, eligible.length]);

  return (
    <Modal
      onClose={onClose}
      zIndex={120}
      icon={<VintedLogo width={55} height={16} />}
      title="Publier sur Vinted"
      subtitle={eligible.length ? `${eligible.length} carte${eligible.length > 1 ? 's' : ''} à publier` : 'Aucune carte publiable'}
      footer={
        <>
          <button onClick={onClose} className="ui-btn ui-btn-ghost mr-auto">Fermer</button>
          {state === 'missing' && <button onClick={retry} className="ui-btn"><RotateCcw size={14} /> Réessayer</button>}
          {state === 'sent' && (
            <a href="https://www.vinted.fr/items/new" target="_blank" rel="noreferrer" className="ui-btn ui-btn-primary">
              Ouvrir Vinted <ExternalLink size={14} />
            </a>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {excluded > 0 && (
          <Notice tone="warning" icon={AlertTriangle}>
            {excluded} carte{excluded > 1 ? 's' : ''} écartée{excluded > 1 ? 's' : ''} : déjà sur Vinted, vendue ou réservée, ou sans photo.
          </Notice>
        )}

        {state === 'sending' && (
          <Notice tone="info"><span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Envoi au panneau CardVaults…</span></Notice>
        )}

        {state === 'sent' && (
          <>
            <Notice tone="success" icon={CheckCircle2}>
              {sentCount} carte{sentCount > 1 ? 's' : ''} envoyée{sentCount > 1 ? 's' : ''} au panneau de l’extension.
              {unpriced > 0 && ` Dont ${unpriced} sans prix : tu le fixeras dans le panneau.`}
            </Notice>
            <ol className="space-y-2.5 text-[13px] text-[var(--text-secondary)]">
              <li className="flex gap-3"><Step n={1} />Ouvre Vinted dans Chrome.</li>
              <li className="flex gap-3"><Step n={2} /><span>Clique sur l’icône CardVaults <PanelRight size={13} className="inline align-[-2px]" aria-hidden /> puis sur l’onglet <b className="font-medium text-[var(--text-primary)]">Publier sur Vinted</b>.</span></li>
              <li className="flex gap-3"><Step n={3} /><span><b className="font-medium text-[var(--text-primary)]">Remplir l’annonce</b>, vérifie-la, clique sur « Ajouter » sur Vinted : l’annonce est associée à la carte toute seule, puis on passe à la suivante.</span></li>
            </ol>
          </>
        )}

        {state === 'missing' && (
          <Notice tone="warning" icon={AlertTriangle}>
            Extension CardVaults Scout introuvable sur cette page. Installe-la ou recharge-la (version {REQUIRED_VERSION} ou plus), recharge CardVaults, puis réessaie.
          </Notice>
        )}

        {state === 'empty' && (
          <p className="text-[13px] text-[var(--text-muted)]">Aucune carte de la sélection n’est publiable : il faut une photo, et ne pas être déjà en ligne sur Vinted ni vendue.</p>
        )}
      </div>
    </Modal>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[11px] font-semibold text-[var(--text-primary)]">{n}</span>
  );
}
