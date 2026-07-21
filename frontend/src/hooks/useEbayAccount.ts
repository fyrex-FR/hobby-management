import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export interface EbayAccountStatus {
  connected: boolean;
  ebay_username?: string | null;
  marketplace_id?: string | null;
  connected_at?: string | null;
}

export function useEbayAccountStatus() {
  return useQuery<EbayAccountStatus>({
    queryKey: ['ebay-account-status'],
    queryFn: () => apiFetch<EbayAccountStatus>('/ebay/account/status'),
  });
}

export function useEbayConnect() {
  return useMutation({
    mutationFn: async () => {
      const { url, error } = await apiFetch<{ url?: string; error?: string }>('/ebay/account/login', {
        method: 'POST',
      });
      if (error || !url) throw new Error(error || 'Connexion eBay indisponible');
      window.location.href = url;
    },
  });
}

export function useEbayDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ connected: boolean }>('/ebay/account', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ebay-account-status'] }),
  });
}
