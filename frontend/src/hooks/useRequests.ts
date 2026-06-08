import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useImpersonateStore } from '../stores/impersonateStore';
import type { ShareRequest, ShareRequestStatus } from '../types';

export function useRequests() {
  const impersonatedUserId = useImpersonateStore((s) => s.impersonatedUserId);
  return useQuery<ShareRequest[]>({
    queryKey: ['share-requests', impersonatedUserId],
    queryFn: () => apiFetch<ShareRequest[]>('/share/requests'),
  });
}

export function useUpdateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ShareRequestStatus }) =>
      apiFetch<ShareRequest>(`/share/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share-requests'] }),
  });
}

export function useDeleteRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/share/requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share-requests'] }),
  });
}
