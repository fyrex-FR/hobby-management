import { supabase } from '../lib/supabase';
import { useImpersonateStore } from '../stores/impersonateStore';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const impersonatedUserId = useImpersonateStore.getState().impersonatedUserId;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (impersonatedUserId) headers['x-impersonate'] = impersonatedUserId;
  return headers;
}

/**
 * @param timeoutMs Délai avant abandon (défaut 60s). Les navigateurs ne
 * mettent pas nativement de délai sur fetch() : sans ça, une requête qui
 * traîne (ex. plusieurs appels eBay enchaînés côté serveur) reste "pendante"
 * jusqu'à ce que le réseau tranche lui-même, avec un message générique
 * illisible ("Load failed", "Failed to fetch").
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}, timeoutMs = 60000): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const base = import.meta.env.VITE_API_URL ?? '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${base}/api${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('Le serveur met trop de temps à répondre. Réessaie dans un instant.');
    }
    throw new Error('Connexion au serveur impossible. Vérifie ta connexion et réessaie.');
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}
