import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export interface PricingSale { title: string; price: number; currency: string; url: string; end_date: string; reason: string }
export interface PricingRun {
  id: string;
  card_id: string;
  query: string | null;
  kept: PricingSale[];
  rejected: PricingSale[];
  median: number | null;
  proposed_price: number | null;
  confidence: string | null;
  reasoning: string | null;
  model: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'error';
  created_at: string;
  decided_at: string | null;
  card: { player: string | null; year: number | null; set_name: string | null; brand: string | null; insert_name: string | null; parallel_name: string | null; numbered: string | null; image_front_url: string | null; ebay_price: number | null } | null;
}

export const usePricingRuns = () =>
  useQuery<{ runs: PricingRun[] }>({ queryKey: ['pricing-runs'], queryFn: () => apiFetch('/pricing-runs') });

export function usePricingDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, price }: { id: string; action: 'accept' | 'reject'; price?: number }) =>
      apiFetch<PricingRun>(`/pricing-runs/${id}/${action}`, { method: 'POST', body: action === 'accept' ? JSON.stringify({ price }) : undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pricing-runs'] }); void qc.invalidateQueries({ queryKey: ['cards'] }); },
  });
}
