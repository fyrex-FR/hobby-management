import { AlertTriangle, Check, ExternalLink, RotateCcw } from 'lucide-react';
import { Panel } from '../ui';
import { errorMessage, toast } from '../../lib/feedback';
import { formatEuro, useDelist, useMarkDelisted } from '../../lib/salon';
import { Thumb } from './parts';
import { cardMeta } from './cardText';

/**
 * Cartes vendues au salon dont une annonce est encore en ligne. eBay est
 * retiré automatiquement à l'encaissement (ici seulement si ça a échoué) ;
 * Vinted n'a pas d'API, le vendeur retire l'annonce puis coche.
 */
export function SalonDelist() {
  const { data = [] } = useDelist();
  const mark = useMarkDelisted();
  if (!data.length) return null;

  const run = (id: string, market: 'vinted' | 'ebay') =>
    mark.mutate({ id, market }, {
      onSuccess: () => toast.success(market === 'vinted' ? 'Noté, annonce Vinted retirée' : 'Annonce eBay retirée'),
      onError: (e) => toast.error(market === 'ebay' ? 'Retrait eBay impossible' : 'Action impossible', { description: errorMessage(e) }),
    });

  return (
    <Panel title={`Annonces à retirer (${data.length})`} icon={AlertTriangle}>
      <p className="-mt-1 mb-2 text-xs text-[var(--text-muted)]">Vendues au salon mais encore en ligne : retire-les pour éviter une double vente.</p>
      <ul className="divide-y divide-[var(--border)]">
        {data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Thumb url={c.image_front_url} className="h-12 w-9 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{c.player ?? 'Carte'}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">{cardMeta(c)}{c.price != null ? ` · vendue ${formatEuro(c.price)}` : ''}</p>
            </div>
            <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
              {c.vinted_url && (
                <>
                  <a className="ui-btn ui-btn-sm" href={c.vinted_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Vinted</a>
                  <button className="ui-btn ui-btn-sm ui-btn-primary" disabled={mark.isPending} onClick={() => run(c.id, 'vinted')}><Check size={13} /> Retirée</button>
                </>
              )}
              {c.ebay_listed && (
                <button className="ui-btn ui-btn-sm" disabled={mark.isPending} onClick={() => run(c.id, 'ebay')}><RotateCcw size={13} /> Retirer d'eBay</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
