import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, RefreshCcw, PackageCheck } from 'lucide-react';
import { useEbaySyncStock } from '../../hooks/useEbayAccount';
import type { EbayStockSyncError } from '../../hooks/useEbayAccount';

interface Props {
  onClose: () => void;
}

const BATCH = 10;

/** Rattrapage du stock app -> eBay, par lots avec progression.
 *
 * Le traitement est découpé côté client (boucle sur `offset`) parce qu'un
 * vendeur peut avoir des centaines d'annonces : une requête unique dépassait le
 * timeout du proxy et affichait « Connexion au serveur impossible » alors que
 * le backend continuait à travailler. Ici, chaque lot est court, la progression
 * est visible, et les échecs sont rejouables séparément. */
export function EbayStockSyncModal({ onClose }: Props) {
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
    void run();
  }, [run]);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const failedIds = summary?.errors.map((e) => e.card_id) ?? [];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={running ? undefined : onClose}>
      <div
        className="w-full max-w-lg rounded-3xl glass border-strong shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-black uppercase tracking-widest text-white">Pousser les stocks</span>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Aligne la quantité de tes annonces eBay sur le stock de l’app. Les annonces déjà à jour sont ignorées.
        </p>

        {running && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-2 text-white">
                <Loader2 size={14} className="animate-spin" />
                Traitement en cours…
              </span>
              {progress && (
                <span style={{ color: 'var(--text-muted)' }}>{progress.done}/{progress.total}</span>
              )}
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: 'var(--accent)' }}
              />
            </div>
          </div>
        )}

        {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

        {summary && !running && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
              <span style={{ color: 'var(--green)' }}>
                {summary.updated} mise{summary.updated > 1 ? 's' : ''} à jour
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                · {summary.unchanged} déjà à jour
                {summary.errors.length > 0 ? ` · ${summary.errors.length} échec${summary.errors.length > 1 ? 's' : ''}` : ''}
              </span>
            </div>

            {summary.errors.length > 0 && (
              <ul className="flex flex-col gap-0.5 max-h-40 overflow-y-auto rounded-lg px-2 py-1.5" style={{ background: 'rgba(239,68,68,0.06)' }}>
                {summary.errors.map((e, i) => (
                  <li key={`${e.card_id}-${i}`} className="text-[11px]" style={{ color: 'var(--red)' }}>
                    {(e.player || e.card_id)} — {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {!running && failedIds.length > 0 && (
            <button
              onClick={() => run(failedIds)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              <RefreshCcw size={15} />
              Réessayer les échecs ({failedIds.length})
            </button>
          )}
          {!running && summary && failedIds.length === 0 && (
            <button
              onClick={() => run()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}
            >
              <RefreshCcw size={15} />
              Relancer
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={running}
            className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
          >
            {running ? 'Patiente…' : 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  );
}
