import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, PackageCheck, RefreshCcw } from 'lucide-react';
import { useEbaySyncStock } from '../../hooks/useEbayAccount';
import type { EbayStockSyncError } from '../../hooks/useEbayAccount';
import { Modal, Notice } from '../ui';

interface Props {
  onClose: () => void;
  /** Restreint le rattrapage à ces cartes (sélection de la Collection). Sans
   * ça, toutes les annonces en ligne du compte sont traitées. */
  cardIds?: string[];
}

const BATCH = 10;

/** Rattrapage du stock app -> eBay, par lots avec progression.
 *
 * Le traitement est découpé côté client (boucle sur `offset`) parce qu'un
 * vendeur peut avoir des centaines d'annonces : une requête unique dépassait le
 * timeout du proxy et affichait « Connexion au serveur impossible » alors que
 * le backend continuait à travailler. Ici, chaque lot est court, la progression
 * est visible, et les échecs sont rejouables séparément. */
export function EbayStockSyncModal({ onClose, cardIds }: Props) {
  const syncStock = useEbaySyncStock();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ updated: number; unchanged: number; errors: EbayStockSyncError[] } | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  const run = useCallback(async (retryIds?: string[]) => {
    setRunning(true);
    setError('');
    setSummary(null);
    setProgress(null);
    let updated = 0;
    let unchanged = 0;
    let errors: EbayStockSyncError[] = [];
    let offset = 0;
    try {
      if (retryIds) {
        // Le réessai doit lui aussi être découpé : l'endpoint borne `card_ids`
        // par requête, donc envoyer tous les échecs d'un coup échouerait dès
        // qu'ils dépassent la taille d'un lot.
        for (let i = 0; i < retryIds.length; i += BATCH) {
          const slice = retryIds.slice(i, i + BATCH);
          const res = await syncStock.mutateAsync({ card_ids: slice });
          if ('connected' in res) {
            setError('Connecte d’abord ton compte eBay.');
            return;
          }
          updated += res.updated;
          unchanged += res.unchanged;
          errors = errors.concat(res.errors);
          setProgress({ done: Math.min(i + BATCH, retryIds.length), total: retryIds.length });
        }
        setSummary({ updated, unchanged, errors });
        return;
      }
      for (;;) {
        const res = await syncStock.mutateAsync({ offset, batch: BATCH });
        if ('connected' in res) {
          setError('Connecte d’abord ton compte eBay.');
          return;
        }
        updated += res.updated;
        unchanged += res.unchanged;
        errors = errors.concat(res.errors);
        setProgress({ done: Math.min(res.next_offset, res.total), total: res.total });
        offset = res.next_offset;
        if (res.done) break;
      }
      setSummary({ updated, unchanged, errors });
    } catch (e) {
      // Un lot a échoué : on garde ce qui a été fait pour que l'utilisateur
      // sache où il en est, au lieu de tout perdre.
      setSummary(updated || unchanged || errors.length ? { updated, unchanged, errors } : null);
      setError((e as Error).message || 'Erreur réseau pendant le rattrapage.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [syncStock]);

  // Lance le rattrapage dès l'ouverture (le bouton qui ouvre la modale vaut
  // déjà confirmation), une seule fois même en mode strict.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run(cardIds);
  }, [run, cardIds]);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const failedIds = summary?.errors.map((e) => e.card_id) ?? [];

  return (
    <Modal
      onClose={onClose}
      icon={<PackageCheck size={18} className="text-[var(--accent)]" />}
      title={cardIds ? 'Mettre à jour les annonces' : 'Pousser les stocks'}
      subtitle={cardIds ? `${cardIds.length} carte${cardIds.length > 1 ? 's' : ''} sélectionnée${cardIds.length > 1 ? 's' : ''}` : 'Toutes les annonces eBay en ligne'}
      dismissible={!running}
      footer={
        <>
          <button onClick={onClose} disabled={running} className="ui-btn ui-btn-ghost">
            {running ? 'Patiente…' : 'Fermer'}
          </button>
          {!running && failedIds.length > 0 && (
            <button onClick={() => run(failedIds)} className="ui-btn ui-btn-primary">
              <RefreshCcw size={15} />
              Réessayer les échecs ({failedIds.length})
            </button>
          )}
          {!running && summary && failedIds.length === 0 && (
            <button onClick={() => run(cardIds)} className="ui-btn">
              <RefreshCcw size={15} />
              Relancer
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--text-muted)]">
          Aligne le prix et la quantité de tes annonces eBay sur celles de l’app
          {cardIds ? ` (${cardIds.length} carte${cardIds.length > 1 ? 's' : ''} sélectionnée${cardIds.length > 1 ? 's' : ''}).` : '.'}
          {' '}Les annonces déjà à jour sont ignorées, et les cartes non publiées sont simplement sautées.
        </p>

        {running && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                <Loader2 size={14} className="animate-spin" />
                Traitement en cours…
              </span>
              {progress && <span className="tabular text-[var(--text-muted)]">{progress.done} / {progress.total}</span>}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}

        {summary && !running && (
          <div className="space-y-2">
            <Notice tone={summary.errors.length > 0 ? 'warning' : 'success'} icon={CheckCircle2}>
              <span className="font-medium">{summary.updated} mise{summary.updated > 1 ? 's' : ''} à jour</span>
              {' '}· {summary.unchanged} déjà à jour
              {summary.errors.length > 0 ? ` · ${summary.errors.length} échec${summary.errors.length > 1 ? 's' : ''}` : ''}
            </Notice>

            {summary.errors.length > 0 && (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border)] px-3 py-2">
                {summary.errors.map((e, i) => (
                  <li key={`${e.card_id}-${i}`} className="text-xs text-[var(--red)]">
                    {(e.player || e.card_id)} — {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
