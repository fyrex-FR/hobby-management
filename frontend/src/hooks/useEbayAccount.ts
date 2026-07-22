import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export interface EbayAccountStatus {
  connected: boolean;
  ebay_username?: string | null;
  marketplace_id?: string | null;
  connected_at?: string | null;
}

export interface EbayLocation {
  merchantLocationKey: string;
  name?: string;
  merchantLocationStatus?: string;
  location?: {
    address?: {
      city?: string;
      postalCode?: string;
      country?: string;
    };
  };
}

export interface EbayLocationStatus {
  connected: boolean;
  locations: EbayLocation[];
}

export interface EbayBusinessPolicies {
  payment?: string | null;
  return?: string | null;
  fulfillment?: string | null;
  options?: {
    payment: EbayPolicyOption[];
    return: EbayPolicyOption[];
    fulfillment: EbayPolicyOption[];
  };
  configured: boolean;
}

export interface EbayPolicyOption {
  id: string;
  name: string;
}

export interface EbaySellerSetup {
  connected: boolean;
  locations: EbayLocation[];
  policies: EbayBusinessPolicies;
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

export function useEbayLocationStatus(enabled: boolean) {
  return useQuery<EbayLocationStatus>({
    queryKey: ['ebay-location-status'],
    queryFn: () => apiFetch<EbayLocationStatus>('/ebay/account/location'),
    enabled,
  });
}

export function useEbaySellerSetup(enabled: boolean) {
  return useQuery<EbaySellerSetup>({
    queryKey: ['ebay-seller-setup'],
    queryFn: () => apiFetch<EbaySellerSetup>('/ebay/account/setup'),
    enabled,
  });
}

export interface EbaySellerImageSettings {
  extra_image_url: string | null;
}

export function useEbaySellerImage() {
  return useQuery<EbaySellerImageSettings>({
    queryKey: ['ebay-seller-image'],
    queryFn: () => apiFetch<EbaySellerImageSettings>('/ebay/account/settings'),
  });
}

export function useEbaySellerImageSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (extra_image_url: string | null) => (
      apiFetch<EbaySellerImageSettings>('/ebay/account/settings', {
        method: 'PUT',
        body: JSON.stringify({ extra_image_url }),
      })
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ebay-seller-image'] }),
  });
}

export function useEbayLocationCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { postal_code: string; city: string; country?: string; name?: string }) => (
      apiFetch<EbayLocationStatus>('/ebay/account/location', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ebay-location-status'] });
      qc.invalidateQueries({ queryKey: ['ebay-seller-setup'] });
    },
  });
}
