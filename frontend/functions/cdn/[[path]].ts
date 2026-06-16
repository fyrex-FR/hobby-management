/**
 * CDN edge cache for card images.
 *
 * Tries R2 first (if configured), falls back to Supabase Storage.
 * This allows a gradual migration without downtime.
 */

interface Env {
  R2_PUBLIC_URL?: string;
  SUPABASE_PUBLIC_URL?: string;
}

const DEFAULT_SUPABASE_URL = 'https://ybiphrhtpqsjwmmhajdu.supabase.co';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params, waitUntil } = context;

  const raw = params.path;
  const path = Array.isArray(raw) ? raw.join('/') : raw;
  if (!path) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Try R2 first if configured
  const r2Base = env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (r2Base) {
    const r2Origin = `${r2Base}/${path}`;
    const r2Resp = await fetch(r2Origin, { cf: { cacheTtl: 86400, cacheEverything: true } });
    if (r2Resp.ok) {
      const resp = new Response(r2Resp.body, r2Resp);
      resp.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      resp.headers.set('Access-Control-Allow-Origin', '*');
      resp.headers.delete('set-cookie');
      waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
    }
  }

  // Fallback to Supabase Storage
  const supabaseBase = (env.SUPABASE_PUBLIC_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const supabaseOrigin = `${supabaseBase}/storage/v1/object/public/card-images/${path}`;
  const upstream = await fetch(supabaseOrigin, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!upstream.ok) return new Response('Not found', { status: upstream.status });

  const resp = new Response(upstream.body, upstream);
  resp.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.delete('set-cookie');

  waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
