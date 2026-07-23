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

export interface EbayShippingRule {
  /** Seuil haut inclus de la tranche ; null = tranche « et au-delà ». */
  max_price: number | null;
  fulfillment_policy_id: string;
}

export function useEbayShippingRules() {
  return useQuery<{ rules: EbayShippingRule[] }>({
    queryKey: ['ebay-shipping-rules'],
    queryFn: () => apiFetch<{ rules: EbayShippingRule[] }>('/ebay/account/shipping-rules'),
  });
}

export function useEbayShippingRulesSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: EbayShippingRule[]) => (
      apiFetch<{ rules: EbayShippingRule[] }>('/ebay/account/shipping-rules', {
        method: 'PUT',
        body: JSON.stringify({ rules }),
      })
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ebay-shipping-rules'] }),
  });
}

/** Renvoie l'id de politique d'expédition de la 1re tranche dont le seuil
 * couvre `price` (tranches triées par seuil croissant, la tranche `max_price:
 * null` couvrant tout le reste), ou null si aucune règle ne s'applique. */
export function matchShippingRule(rules: EbayShippingRule[], price: number): string | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const capped = rules
    .filter((r) => r.max_price != null)
    .sort((a, b) => (a.max_price as number) - (b.max_price as number));
  for (const rule of capped) {
    if (price <= (rule.max_price as number)) return rule.fulfillment_policy_id || null;
  }
  const openEnded = rules.find((r) => r.max_price == null);
  return openEnded?.fulfillment_policy_id || null;
}

export interface EbayApplyImageError {
  item_id: string;
  title: string | null;
  message: string;
}

export type EbayApplyImageBatchResult =
  | { connected: false }
  | {
      done: boolean;
      next_offset: number;
      total: number;
      updated: number;
      skipped: number;
      errors: EbayApplyImageError[];
      eps_image_url: string;
    };

/** Un seul lot d'annonces traité par appel — le composant appelant rappelle
 * cette mutation en boucle (offset croissant) jusqu'à `done: true`, avec un
 * timeout long (upload EPS + révisions d'annonces peuvent prendre du temps). */
export function useEbayApplyImageToListings() {
  return useMutation({
    mutationFn: (body: { offset: number; batch: number }) => (
      apiFetch<EbayApplyImageBatchResult>(
        '/ebay/account/apply-image-to-listings',
        { method: 'POST', body: JSON.stringify(body) },
        120000,
      )
    ),
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
