/**
 * Mesure d'audience de la page publique du stand, pour le bilan de fin de
 * journée. Anonyme : un identifiant aléatoire par navigateur, aucune donnée
 * personnelle, rien envoyé à un tiers. Les visites du vendeur (navigateur
 * qui a ouvert l'écran Salon) ne sont pas comptées.
 */
export type SalonEventKind = 'visit' | 'view' | 'add' | 'cart';
export interface SalonEvent { kind: SalonEventKind; card_id?: string }

const VISITOR_KEY = 'cv-salon-visitor';
const ownerKey = (token: string) => `cv-salon-owner-${token}`;
let memoryVisitor: string | null = null;

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

export function visitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) { v = randomId(); localStorage.setItem(VISITOR_KEY, v); }
    return v;
  } catch {
    return (memoryVisitor ??= randomId());
  }
}

/** Appelé par l'écran vendeur : ce navigateur est celui du propriétaire du stand. */
export function markOwner(token: string) {
  try { localStorage.setItem(ownerKey(token), '1'); } catch { /* stockage indisponible */ }
}

export function isOwner(token: string): boolean {
  try { return localStorage.getItem(ownerKey(token)) === '1'; } catch { return false; }
}

type Send = (body: string) => void;

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Envoi en text/plain + keepalive : pas de pré-vol CORS et la requête part
 * même si la page se ferme juste après.
 */
const defaultSend = (token: string): Send => (body) => {
  void fetch(`${API_BASE}/api/salon/${token}/events`, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => { /* au mieux */ });
};

export interface Tracker {
  track: (kind: SalonEventKind, cardId?: string) => void;
  flush: () => void;
}

/**
 * Regroupe les événements (un envoi toutes les quelques secondes au plus) et
 * ne garde chaque couple type + carte qu'une fois par visite.
 */
export function createTracker(token: string, opts: { send?: Send; delayMs?: number; disabled?: boolean } = {}): Tracker {
  const send = opts.send ?? defaultSend(token);
  const delay = opts.delayMs ?? 4000;
  const seen = new Set<string>();
  let queue: SalonEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    const events = queue;
    queue = [];
    send(JSON.stringify({ visitor: visitorId(), events }));
  };

  return {
    track(kind, cardId) {
      if (opts.disabled) return;
      const k = `${kind}:${cardId ?? ''}`;
      if (seen.has(k)) return;
      seen.add(k);
      queue.push(cardId ? { kind, card_id: cardId } : { kind });
      if (!timer) timer = setTimeout(flush, delay);
    },
    flush,
  };
}
