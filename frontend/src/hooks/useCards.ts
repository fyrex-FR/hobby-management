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

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Card> & { id: string }) =>
      apiFetch<Card>(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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
