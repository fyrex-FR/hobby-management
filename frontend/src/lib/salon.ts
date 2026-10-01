import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { apiFetch } from '../api/client';
import type { Card } from '../types';

export interface SalonStand { user_id: string; token: string; is_open: boolean; title: string | null; paypal_me: string | null }
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
  lines: SalonLine[];
}

export type LineState = 'none' | 'offered' | 'accepted' | 'countered' | 'refused';
export interface SalonLine { card_id: string; asked: number; offer: number | null; final: number; state: LineState }
export interface PublicLine extends SalonLine { player: string | null; set_name: string | null; year: string | null; image_front_url: string | null }
export type OfferState = 'none' | 'offered' | 'accepted' | 'countered' | 'refused';
export interface OfferSummary { asked: number; offer: number | null; offer_state: OfferState }
export interface PublicCart extends OfferSummary {
  code: string;
  status: 'active' | 'paid' | 'cancelled' | 'expired';
  total: number;
  expires_at: string;
  card_ids: string[];
  lines: PublicLine[];
}
/** Réservation du visiteur, gardée dans son navigateur : le code et la clé pour la modifier. */
export interface SalonTicket { code: string; key: string }

const euroWhole = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euroCents = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** « 12 € », « 1,50 € » : les centimes seulement quand il y en a. */
export const formatEuro = (v: number) => (Number.isInteger(Math.round(v * 100) / 100) ? euroWhole : euroCents).format(v);

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
    mutationFn: (body: Partial<Pick<SalonStand, 'is_open' | 'title' | 'paypal_me'>>) => apiFetch<SalonStand>('/salon/stand', { method: 'PATCH', body: JSON.stringify(body) }),
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

export function useLineAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cardId, ...body }: { id: string; cardId: string; final?: number; state?: 'accepted' | 'refused' }) =>
      apiFetch<SalonCart>(`/salon/carts/${id}/lines/${cardId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['salon-carts'] }); },
  });
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Même calcul que le serveur : vue « lot » des lignes d'un panier. */
export function offerSummary(lines: SalonLine[]): OfferSummary {
  const asked = round2(lines.reduce((s, l) => s + l.asked, 0));
  const offered = lines.filter((l) => l.offer != null);
  if (!offered.length) return { asked, offer: null, offer_state: 'none' };
  const states = new Set(offered.map((l) => l.state));
  const offer_state: OfferState = states.has('offered') ? 'offered'
    : states.has('countered') ? 'countered'
    : states.size === 1 && states.has('accepted') ? 'accepted'
    : 'refused';
  return { asked, offer: round2(offered.reduce((s, l) => s + (l.offer ?? 0), 0)), offer_state };
}

/**
 * Propositions d'offre en un geste : environ -10 %, -15 %, -20 %, arrondies à
 * un montant « qui se dit » (50 cts sous 10 €, l'euro, 5 € au-delà de 100 €).
 * Le pourcentage affiché est celui du montant arrondi ; au-delà de -30 % on
 * ne propose rien (petites cartes à 1-2 €).
 */
export function offerSuggestions(total: number): { pct: number; amount: number }[] {
  const step = total >= 100 ? 5 : total >= 10 ? 1 : 0.5;
  const out: { pct: number; amount: number }[] = [];
  for (const target of [10, 15, 20]) {
    const amount = Math.floor((total * (1 - target / 100)) / step) * step;
    const pct = Math.round((1 - amount / total) * 100);
    if (amount > 0 && amount < total && pct <= 30 && !out.some((o) => o.amount === amount)) out.push({ pct, amount });
  }
  return out;
}

/** Montant saisi (« 12,50 », « 12 € ») → nombre, ou null si invalide. */
export function parseAmount(raw: string): number | null {
  const v = Number(raw.replace(/[€\s]/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? round2(v) : null;
}

/** Plafonds de budget proposés au visiteur. */
export const BUDGETS = [5, 10, 20, 50, 100] as const;

/* ── API publique du stand (sans compte) ─────────────────────────────────── */

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class SalonError extends Error {
  status: number;
  unavailable: string[];
  constructor(status: number, unavailable: string[] = [], message = 'Erreur') {
    super(message);
    this.status = status;
    this.unavailable = unavailable;
  }
}

async function publicCall<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}/api/salon/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!r.ok) {
    let detail: unknown = null;
    try { detail = (await r.json()).detail; } catch { /* corps vide */ }
    const unavailable = (detail as { unavailable?: string[] } | null)?.unavailable ?? [];
    throw new SalonError(r.status, unavailable, typeof detail === 'string' ? detail : `Erreur ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export interface SalonStock { title: string | null; paypal_me: string | null; hold_minutes: number; cards: Card[]; reserved: string[] }
export interface SalonLive { reserved: string[]; sold: string[] }
export interface CartPayload { card_ids: string[]; pseudo?: string | null; offer?: number | null; visitor?: string | null }

export const salonApi = (token: string) => ({
  stock: () => publicCall<SalonStock>(`${token}/stock`),
  live: () => publicCall<SalonLive>(`${token}/live`),
  cart: (t: SalonTicket) => publicCall<PublicCart>(`${token}/carts/${t.code}?key=${encodeURIComponent(t.key)}`),
  create: (body: CartPayload) => publicCall<SalonTicket>(`${token}/carts`, { method: 'POST', body: JSON.stringify(body) }),
  update: (t: SalonTicket, body: CartPayload) => publicCall<SalonTicket>(`${token}/carts/${t.code}`, { method: 'PUT', body: JSON.stringify({ ...body, key: t.key }) }),
  cancel: (t: SalonTicket) => publicCall<unknown>(`${token}/carts/${t.code}/cancel`, { method: 'POST', body: JSON.stringify({ key: t.key }) }),
  accept: (t: SalonTicket) => publicCall<unknown>(`${token}/carts/${t.code}/accept`, { method: 'POST', body: JSON.stringify({ key: t.key }) }),
});

/* ── Vendeur ─────────────────────────────────────────────────────────────── */

export function useOfferAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; action: 'accept' | 'refuse' | 'counter'; total?: number }) =>
      apiFetch<SalonCart>(`/salon/carts/${id}/offer`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['salon-carts'] }); },
  });
}
