import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { apiFetch } from '../api/client';
import { useImpersonateStore } from '../stores/impersonateStore';
import type { Card } from '../types';
import { toast } from '../lib/feedback';

/** Ids en cours de suppression (fenêtre « Annuler ») : masqués même si la liste est rechargée entre-temps. */
const usePendingDeleteIds = create<{ ids: ReadonlySet<string>; add: (ids: string[]) => void; remove: (ids: string[]) => void }>((set) => ({
  ids: new Set(),
  add: (ids) => set((s) => ({ ids: new Set([...s.ids, ...ids]) })),
  remove: (ids) => set((s) => {
    const next = new Set(s.ids);
    ids.forEach((id) => next.delete(id));
    return { ids: next };
  }),
}));

export function useCards() {
  const impersonatedUserId = useImpersonateStore((s) => s.impersonatedUserId);
  const pending = usePendingDeleteIds((s) => s.ids);
  const query = useQuery<Card[]>({
    queryKey: ['cards', impersonatedUserId],
    queryFn: () => apiFetch<Card[]>('/cards'),
  });
  const data = useMemo(
    () => (pending.size && query.data ? query.data.filter((c) => !pending.has(c.id)) : query.data),
    [query.data, pending],
  );
  return { ...query, data };
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Card>) =>
      apiFetch<Card>('/cards', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}

/** Résultat de la répercussion du stock sur l'annonce eBay, renvoyé par le
 * backend quand la mise à jour touche `quantity` et que la carte a une annonce
 * en ligne. Absent sinon. Best-effort : la carte est enregistrée même si eBay
 * échoue. */
export interface EbayQuantitySync {
  ok: boolean;
  quantity?: number;
  error?: string;
}

export type UpdatedCard = Card & { ebay_quantity_sync?: EbayQuantitySync | null };

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Card> & { id: string }) =>
      apiFetch<UpdatedCard>(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/cards/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useRecalculateEbayPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { card_ids: string[]; only_missing: boolean }) =>
      apiFetch<{ updated: number; skipped: number }>('/cards/recalculate-ebay-prices', {
        method: 'POST',
        body: JSON.stringify(data),
      }, 120000),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}

const UNDO_DELAY_MS = 6000;
/** Suppressions en attente (fenêtre d'annulation), envoyées d'office si la page se ferme. */
const pendingDeletes = new Map<string, () => void>();
window.addEventListener('pagehide', () => {
  for (const flush of pendingDeletes.values()) flush();
});

/**
 * Suppression avec « Annuler » : les cartes disparaissent tout de suite de
 * l'affichage, la vraie suppression part après quelques secondes sauf si
 * l'utilisateur annule. Retourne une fonction à appeler avec les ids.
 */
export function useDeleteCardsWithUndo() {
  const qc = useQueryClient();

  return function deleteWithUndo(ids: string[], label: string) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const key = `del-${Date.now()}-${ids[0]}`;
    const snapshots = qc.getQueriesData<Card[]>({ queryKey: ['cards'] });
    qc.setQueriesData<Card[]>({ queryKey: ['cards'] }, (old) => old?.filter((c) => !idSet.has(c.id)));
    usePendingDeleteIds.getState().add(ids);

    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      pendingDeletes.delete(key);
      const results = await Promise.allSettled(ids.map((id) => apiFetch<void>(`/cards/${id}`, { method: 'DELETE' })));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) toast.error(failed > 1 ? `${failed} cartes n'ont pas pu être supprimées.` : `Une carte n'a pas pu être supprimée.`);
      await qc.invalidateQueries({ queryKey: ['cards'] });
      usePendingDeleteIds.getState().remove(ids);
    };
    const timer = window.setTimeout(commit, UNDO_DELAY_MS);
    pendingDeletes.set(key, () => { window.clearTimeout(timer); void commit(); });

    toast(label, {
      duration: UNDO_DELAY_MS,
      action: {
        label: 'Annuler',
        onClick: () => {
          if (done) {
            toast.error('Trop tard : la suppression est déjà partie.');
            return;
          }
          done = true;
          window.clearTimeout(timer);
          pendingDeletes.delete(key);
          usePendingDeleteIds.getState().remove(ids);
          for (const [k, data] of snapshots) qc.setQueryData(k, data);
          toast.success('Suppression annulée');
        },
      },
    });
  };
}
