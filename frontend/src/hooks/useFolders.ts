import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useImpersonateStore } from '../stores/impersonateStore';
import type { Folder } from '../types';

export function useFolders() {
  const impersonatedUserId = useImpersonateStore((s) => s.impersonatedUserId);
  return useQuery<Folder[]>({
    queryKey: ['folders', impersonatedUserId],
    queryFn: () => apiFetch<Folder[]>('/folders'),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; emoji?: string | null; position?: number }) =>
      apiFetch<Folder>('/folders', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; emoji?: string | null; position?: number }) =>
      apiFetch<Folder>(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/folders/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}
