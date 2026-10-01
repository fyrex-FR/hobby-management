import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { apiFetch } from '../api/client';
import type { Card } from '../types';

export interface SalonStand { user_id: string; token: string; is_open: boolean; title: string | null }
export interface SalonCart {
  id: string;
  code: string;
  card_ids: string[];
  total: number;
  pseudo: string | null;
  status: 'active' | 'paid' | 'cancelled';
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  cards: Card[];
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatEuro = (v: number) => euro.format(v);

export const standUrl = (token: string) => `${window.location.origin}/salon/${token}`;
export const cartUrl = (code: string) => `${window.location.origin}/#/salon?c=${code}`;

/** Code panier lu dans `#/salon?c=CODE` (QR présenté par le visiteur). */
export function codeFromHash(hash = window.location.hash): string | null {
  const m = hash.match(/[?&]c=([A-Za-z0-9]{4})\b/);
  return m ? m[1].toUpperCase() : null;
}

export function useQrDataUrl(text: string | null): string | null {
  const [qr, setQr] = useState<{ text: string; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    if (text) QRCode.toDataURL(text, { margin: 1, width: 480, errorCorrectionLevel: 'M' }).then((url) => { if (alive) setQr({ text, url }); });
    return () => { alive = false; };
  }, [text]);
  return qr && qr.text === text ? qr.url : null;
}

export function useSalonStand() {
  return useQuery<SalonStand>({ queryKey: ['salon-stand'], queryFn: () => apiFetch<SalonStand>('/salon/stand') });
}

export function useUpdateStand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<SalonStand, 'is_open' | 'title'>>) => apiFetch<SalonStand>('/salon/stand', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salon-stand'] }),
  });
}

export function useSalonCarts() {
  return useQuery<SalonCart[]>({ queryKey: ['salon-carts'], queryFn: () => apiFetch<SalonCart[]>('/salon/carts'), refetchInterval: 5000 });
}

export function useCartAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pay' | 'cancel' | 'extend' }) => apiFetch<SalonCart>(`/salon/carts/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['salon-carts'] }); void qc.invalidateQueries({ queryKey: ['cards'] }); },
  });
}

export const fetchCartByCode = (code: string) => apiFetch<SalonCart>(`/salon/carts/by-code/${encodeURIComponent(code)}`);

export function minutesLeft(expiresAt: string, now = Date.now()): number {
  return Math.ceil((new Date(expiresAt).getTime() - now) / 60000);
}
