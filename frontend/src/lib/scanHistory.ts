import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { AIIdentificationResult } from '../types';

export interface ScanRow {
  id: string;
  created_at: string;
  ident: AIIdentificationResult;
  estimate_value: number | null;
  estimate_status: string | null;
  thumb: string | null;
  card_id: string | null;
}

/** JPEG redimensionné (côté long ≤ maxPx) en data URL, stocké tel quel en base. */
export async function imageDataUrl(blob: Blob, maxPx: number, quality = 0.75): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function saveScan(scan: { id: string; ident: AIIdentificationResult; estimate_value: number | null; estimate_status: string; front: Blob; back?: Blob }) {
  const [thumb, front, back] = await Promise.all([
    imageDataUrl(scan.front, 240, 0.7),
    imageDataUrl(scan.front, 800),
    scan.back ? imageDataUrl(scan.back, 800) : Promise.resolve(null),
  ]);
  await apiFetch('/scans', {
    method: 'PUT',
    body: JSON.stringify({ id: scan.id, ident: scan.ident, estimate_value: scan.estimate_value, estimate_status: scan.estimate_status, thumb, front, back }),
  });
}

export const linkScanCard = (id: string, card_id: string) =>
  apiFetch(`/scans/${id}`, { method: 'PATCH', body: JSON.stringify({ card_id }) });

export function useScans() {
  return useQuery<ScanRow[]>({ queryKey: ['scans'], queryFn: () => apiFetch<ScanRow[]>('/scans') });
}

export function useDeleteScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/scans/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scans'] }),
  });
}

/** Regroupe par jour local (les lignes arrivent déjà triées du plus récent au plus ancien). */
export function groupByDay(rows: ScanRow[]): { day: string; rows: ScanRow[]; total: number }[] {
  const groups = new Map<string, ScanRow[]>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    groups.set(day, [...(groups.get(day) ?? []), r]);
  }
  return [...groups].map(([day, rs]) => ({ day, rows: rs, total: rs.reduce((s, r) => s + (r.estimate_value ?? 0), 0) }));
}

/** App installée (écran d'accueil) : le scan prend tout l'écran, sans menu Collection. */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
