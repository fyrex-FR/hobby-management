import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useImpersonateStore } from '../stores/impersonateStore';
import type { Card } from '../types';

export function useCards() {
  const impersonatedUserId = useImpersonateStore((s) => s.impersonatedUserId);
  return useQuery<Card[]>({
    queryKey: ['cards', impersonatedUserId],
    queryFn: () => apiFetch<Card[]>('/cards'),
  });
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
