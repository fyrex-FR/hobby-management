import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Check, CopyPlus, Eye, ImageOff, Inbox, PackageCheck, Plus, RefreshCw, SearchX, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useCards } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card, ImportAction, ImportBatch, ImportItem } from '../../types';
import { Badge, EmptyState, Modal, Notice, Page, PageHeader, Panel, Spinner } from '../ui';

const CLASS_LABEL = { match: 'Déjà en collection', probable: 'Doublon probable', new: 'Nouvelle carte', insufficient: 'Identification insuffisante', error: 'Erreur', processing: 'Analyse en cours' } as const;
const CLASS_TONE = { match: 'blue', probable: 'accent', new: 'green', insufficient: 'neutral', error: 'red', processing: 'neutral' } as const;
const ACTION_LABEL: Record<ImportAction, string> = { shelve: 'mis de côté', create: 'carte créée', increment: 'exemplaire ajouté', ignore: 'ignoré', review: 'à revoir' };
interface BulkResult { processed: number; created: number; shelved: number; remaining: number; manual_review: number }

export function ImportReviewView() {
  const batchId = useAppStore((state) => state.importBatchId);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const { data: cards = [] } = useCards();
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [index, setIndex] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batchId) return;
    apiFetch<ImportBatch>(`/imports/${batchId}`).then(setBatch).catch((cause) => setError(cause.message));
  }, [batchId]);

  const items = useMemo(() => batch?.items || [], [batch?.items]);
  const item = items[index];
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const candidates = (item?.matches || []).map((match) => ({ match, card: cardById.get(match.card_id) })).filter((entry): entry is { match: ImportItem['matches'][number]; card: Card } => Boolean(entry.card));
  const recommended = useMemo(() => items.filter((entry) => {
    if (entry.action_at) return false;
    const best = entry.matches?.[0];
    return (entry.classification === 'match' && !!best && best.score >= 85)
      || (entry.classification === 'new' && (!best || best.score < 55));
  }), [items]);
  const recommendedCreates = recommended.filter((entry) => entry.classification === 'new').length;
  const recommendedShelves = recommended.length - recommendedCreates;

  useEffect(() => { setSelectedCardId(candidates[0]?.card.id || null); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: ImportAction) {
    if (!item || busy) return;
    if (action === 'increment' && !selectedCardId) { setError('Choisis une carte existante.'); return; }
    setBusy(true); setError('');
    try {
      const updated = await apiFetch<ImportItem>(`/imports/items/${item.id}/action`, {
        method: 'POST', body: JSON.stringify({ action, target_card_id: action === 'increment' || action === 'shelve' ? selectedCardId : null }),
      });
      setBatch((current) => current ? { ...current, items: (current.items || []).map((entry) => entry.id === updated.id ? updated : entry) } : current);
      if (action === 'create' || action === 'increment') await queryClient.invalidateQueries({ queryKey: ['cards'] });
      if (index + 1 < items.length) setIndex(index + 1);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function retry() {
    if (!item || busy) return;
    setBusy(true); setError('');
    try {
      const updated = await apiFetch<ImportItem>(`/imports/items/${item.id}/retry`, { method: 'POST' }, 90000);
      setBatch((current) => current ? { ...current, items: (current.items || []).map((entry) => entry.id === updated.id ? updated : entry) } : current);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function applyBulk() {
    if (!batchId || busy || recommended.length === 0) return;
    setBusy(true); setError(''); setShowBulkConfirm(false);
    const total = recommended.length;
    let done = 0;
    setBulkProgress({ done, total });
    try {
      let remaining = total;
      while (remaining > 0) {
        const result = await apiFetch<BulkResult>(`/imports/${batchId}/apply-recommended`, {
          method: 'POST', body: JSON.stringify({ limit: 50 }),
        }, 90000);
        if (result.processed === 0) break;
        done += result.processed;
        remaining = result.remaining;
        setBulkProgress({ done, total });
      }
      const refreshed = await apiFetch<ImportBatch>(`/imports/${batchId}`);
      setBatch(refreshed);
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  const backButton = (
    <button onClick={() => setActiveView('batch')} className="ui-btn ui-btn-ghost">
      <ArrowLeft size={16} /> Sas d’import
    </button>
  );

  if (!batchId) {
    return (
      <Page>
        <PageHeader title="Revue de l’import" actions={backButton} />
        <EmptyState icon={Inbox} title="Aucun sas sélectionné" description="Lance un import depuis le sas ou reprends un import récent." />
      </Page>
    );
  }
  if (!batch || !item) {
    return (
      <Page>
        <PageHeader title="Revue de l’import" subtitle={batch?.name} actions={backButton} />
        {error ? (
          <Notice tone="error" icon={AlertCircle}>{error}</Notice>
        ) : batch ? (
          <EmptyState icon={Inbox} title="Ce sas est vide" description="Aucune carte n’a été analysée dans cet import." />
        ) : (
          <Spinner label="Chargement…" />
        )}
      </Page>
    );
  }
  const identification = item.identification;
  const idRows: Array<[string, string | null | undefined]> = identification ? [
    ['Année', identification.year],
    ['Set', [identification.brand, identification.set].filter(Boolean).join(' ')],
    ['N°', identification.card_number],
    ['Insert', identification.insert],
    ['Parallel', identification.parallel],
    ['Tirage', identification.serial_number || identification.numbered],
  ] : [];

  return (
    <Page width="wide">
      <PageHeader title="Revue de l’import" subtitle={batch.name} actions={backButton} />

      {recommended.length > 0 && (
        <section className="ui-card flex flex-col justify-between gap-3 border-[var(--border-accent)] p-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Sparkles size={16} className="shrink-0 text-[var(--accent)]" />
              {recommended.length} décisions sûres peuvent être appliquées ensemble
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {recommendedCreates} nouvelles cartes à créer · {recommendedShelves} matchs ≥85 % à mettre de côté · cas ambigus exclus
            </p>
          </div>
          <button disabled={busy} onClick={() => setShowBulkConfirm(true)} className="ui-btn ui-btn-primary shrink-0">
            Appliquer en masse
          </button>
        </section>
      )}

      {bulkProgress && (
        <section className="ui-card space-y-2 p-4">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium text-[var(--text-primary)]">Décisions en masse</span>
            <span className="tabular text-[var(--text-muted)]">{bulkProgress.done} / {bulkProgress.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }} />
          </div>
        </section>
      )}

      <Modal
        open={showBulkConfirm}
        onClose={() => setShowBulkConfirm(false)}
        title="Confirmer les décisions en masse"
        icon={<Sparkles size={18} className="text-[var(--accent)]" />}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowBulkConfirm(false)} className="ui-btn">Annuler</button>
            <button onClick={applyBulk} className="ui-btn ui-btn-primary">Appliquer {recommended.length}</button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Créer {recommendedCreates} nouvelles cartes et mettre de côté {recommendedShelves} correspondances à au moins 85 %. Les doublons probables et identifications insuffisantes resteront à vérifier manuellement.
        </p>
      </Modal>

      {/* Navigation entre les cartes du lot */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone={CLASS_TONE[item.classification]}>{CLASS_LABEL[item.classification]}</Badge>
          <span className="tabular text-[13px] text-[var(--text-muted)]">Carte {index + 1} / {items.length}</span>
        </div>
        <div className="flex gap-2">
          <button disabled={index === 0} onClick={() => setIndex(index - 1)} className="ui-btn ui-btn-icon" aria-label="Carte précédente">
            <ChevronLeft size={16} />
          </button>
          <button disabled={index + 1 >= items.length} onClick={() => setIndex(index + 1)} className="ui-btn ui-btn-icon" aria-label="Carte suivante">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <Panel title="Carte importée">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
                <img src={item.front_image_url} alt="Recto" className="max-h-[55vh] w-full object-contain" />
              </div>
              {item.back_image_url ? (
                <div className="flex items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
                  <img src={item.back_image_url} alt="Verso" className="max-h-[55vh] w-full object-contain" />
                </div>
              ) : (
                <div className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-muted)]">
                  <ImageOff size={18} /> Pas de verso
                </div>
              )}
            </div>
            {identification && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{identification.player || 'Joueur non lu'}</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                  {idRows.map(([label, value]) => (
                    <div key={label} className="flex min-w-0 gap-2">
                      <dt className="shrink-0 text-[var(--text-muted)]">{label}</dt>
                      <dd className="truncate text-[var(--text-primary)]">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {item.error && (
              <div className="space-y-2">
                <Notice tone="error" icon={AlertCircle}>{item.error}</Notice>
                <button disabled={busy} onClick={retry} className="ui-btn">
                  <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Relancer l’identification
                </button>
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Meilleurs matchs existants" padded={false}>
            {candidates.length === 0 ? (
              <EmptyState icon={SearchX} title="Aucun candidat suffisamment proche" description="Cette carte semble absente de ta collection." />
            ) : (
              <div className="space-y-2 p-3">
                {candidates.map(({ match, card }) => {
                  const selected = selectedCardId === card.id;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setSelectedCardId(card.id)}
                      aria-pressed={selected}
                      className={`grid w-full grid-cols-[56px_1fr_auto] gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                        selected ? 'border-[var(--border-accent)] bg-[var(--accent-dim)]' : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {card.image_front_url
                        ? <img src={card.image_front_url} alt="" className="h-[75px] w-14 rounded-md object-cover" />
                        : <div className="h-[75px] w-14 rounded-md bg-[var(--bg-hover)]" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{card.player}</span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">{card.year} · {card.brand} {card.set_name} · {card.card_number}</span>
                        <span className="mt-1.5 block text-xs text-[var(--text-secondary)]">{match.reasons.join(' · ') || 'Peu de signaux communs'}</span>
                        {match.conflicts.length > 0 && <span className="mt-0.5 block text-xs text-[var(--accent)]">Différences : {match.conflicts.join(', ')}</span>}
                      </span>
                      <span className="tabular text-sm font-semibold text-[var(--accent)]">{match.score}%</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          {item.action_at ? (
            <Notice tone="success" icon={Check}>Traité : {item.action ? ACTION_LABEL[item.action] ?? item.action : '—'}</Notice>
          ) : (
            <Panel title="Décision">
              <div className="grid gap-2 sm:grid-cols-2">
                <button disabled={busy} onClick={() => act('create')} className="ui-btn ui-btn-primary ui-btn-lg sm:col-span-2">
                  <Plus size={16} /> Créer la carte
                </button>
                <button disabled={busy} onClick={() => act('shelve')} className="ui-btn ui-btn-lg">
                  <PackageCheck size={16} /> Mettre de côté
                </button>
                <button disabled={busy} onClick={() => act('increment')} className="ui-btn ui-btn-lg">
                  <CopyPlus size={16} /> Ajouter un exemplaire
                </button>
                <button disabled={busy} onClick={() => act('review')} className="ui-btn">
                  <Eye size={15} /> À revoir
                </button>
                <button disabled={busy} onClick={() => act('ignore')} className="ui-btn ui-btn-ghost">
                  <X size={15} /> Ignorer
                </button>
              </div>
            </Panel>
          )}
          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
        </div>
      </div>
    </Page>
  );
}
