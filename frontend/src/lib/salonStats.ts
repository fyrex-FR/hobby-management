import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { Card } from '../types';

export interface SalonFunnel { visitors: number; viewed: number; added: number; reserved: number; paid: number }
export interface TopCard { card: Card; count: number; sold: boolean }
export interface SalonStats {
  sales: {
    carts: number;
    status: { paid: number; cancelled: number; expired: number; active: number };
    revenue: number;
    cards_sold: number;
    avg_cart: number;
    discount: number;
    offers: number;
    offers_accepted: number;
    offers_refused: number;
    offers_countered: number;
  };
  paid_at: string[];
  tracking: boolean;
  funnel?: SalonFunnel;
  visits_at?: string[];
  top_viewed?: TopCard[];
  top_added?: TopCard[];
  searches?: { query: string; count: number }[];
  searches_empty?: { query: string; count: number }[];
  /** Début effectif du bilan quand il a été remis à zéro dans la journée. */
  since?: string | null;
}

/** « 2026-10-01 » (date locale) → bornes UTC de cette journée locale. */
export function dayRange(day: string): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number);
  return { start: new Date(y, m - 1, d).toISOString(), end: new Date(y, m - 1, d + 1).toISOString() };
}

export function localDay(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + delta));
}

/** Étapes de l'entonnoir avec la part des visiteurs et le taux depuis l'étape précédente. */
export function funnelSteps(f: SalonFunnel) {
  const steps = [
    { key: 'visitors', label: 'Visiteurs', count: f.visitors },
    { key: 'viewed', label: 'Ont regardé une carte', count: f.viewed },
    { key: 'added', label: 'Ont ajouté au panier', count: f.added },
    { key: 'reserved', label: 'Ont réservé', count: f.reserved },
    { key: 'paid', label: 'Ont payé', count: f.paid },
  ];
  return steps.map((s, i) => ({
    ...s,
    share: f.visitors ? s.count / f.visitors : 0,
    fromPrev: i === 0 ? null : steps[i - 1].count ? s.count / steps[i - 1].count : 0,
  }));
}

/**
 * Affluence heure par heure (heure locale), de la première à la dernière
 * heure qui a de l'activité.
 */
export function hourly(visits: string[], sales: string[]): { hour: number; visits: number; sales: number }[] {
  const hour = (iso: string) => new Date(iso).getHours();
  const hours = [...visits, ...sales].map(hour);
  if (!hours.length) return [];
  const out = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
    out.push({ hour: h, visits: visits.filter((v) => hour(v) === h).length, sales: sales.filter((v) => hour(v) === h).length });
  }
  return out;
}

export function useSalonStats(day: string, live: boolean) {
  return useQuery<SalonStats>({
    queryKey: ['salon-stats', day],
    queryFn: () => {
      const { start, end } = dayRange(day);
      return apiFetch<SalonStats>(`/salon/stats?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    },
    refetchInterval: live ? 30000 : false,
  });
}

/** Remise à zéro du bilan du jour (rien n'est supprimé ; `undo` l'annule). */
export function useResetStats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (undo: boolean) => apiFetch<unknown>('/salon/stats/reset', { method: 'POST', body: JSON.stringify({ undo }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['salon-stats'] }); void qc.invalidateQueries({ queryKey: ['salon-stand'] }); },
  });
}
