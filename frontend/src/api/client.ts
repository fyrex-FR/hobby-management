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
 * @param timeoutMs Délai avant de considérer la requête trop lente (défaut
 * 60s). Volontairement implémenté avec Promise.race plutôt qu'un
 * AbortController relié au fetch : WebKit/Safari a un bug connu où combiner
 * `signal` et un `body` (POST/PATCH avec JSON) fait échouer fetch()
 * instantanément avec un message générique ("Load failed"), y compris pour
 * des requêtes qui auraient parfaitement abouti. Ici, le fetch d'origine
 * n'est jamais annulé : on abandonne juste l'attente de son résultat.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}, timeoutMs = 60000): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const base = import.meta.env.VITE_API_URL ?? '';

  const fetchPromise = fetch(`${base}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('__TIMEOUT__')), timeoutMs);
  });

  let resp: Response;
  try {
    resp = await Promise.race([fetchPromise, timeoutPromise]);
  } catch (e) {
    if ((e as Error).message === '__TIMEOUT__') {
      throw new Error('Le serveur met trop de temps à répondre. Réessaie dans un instant.');
    }
    throw new Error('Connexion au serveur impossible. Vérifie ta connexion et réessaie.');
  }

  if (!resp.ok) {
    const text = await resp.text();
    let detail = text;
    try {
      const payload = JSON.parse(text);
      detail = typeof payload.detail === 'string' ? payload.detail : text;
    } catch {
      detail = text;
    }
    throw new Error(detail || `API ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}
