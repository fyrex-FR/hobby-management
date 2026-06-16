/**
 * CDN edge cache for card images stored on Cloudflare R2.
 *
 * Requests to `/cdn/<path>` are proxied to the R2 public custom domain
 * and cached at the Cloudflare edge.
 */

interface Env {
  R2_PUBLIC_URL?: string;
}

const DEFAULT_R2_URL = 'https://images.cardvaults.app';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params, waitUntil } = context;

  const raw = params.path;
  const path = Array.isArray(raw) ? raw.join('/') : raw;
  if (!path) return new Response('Not found', { status: 404 });

  const base = (env.R2_PUBLIC_URL || DEFAULT_R2_URL).replace(/\/$/, '');

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const origin = `${base}/${path}`;
  const upstream = await fetch(origin, {
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!upstream.ok) return new Response('Not found', { status: upstream.status });

  const resp = new Response(upstream.body, upstream);
  resp.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.delete('set-cookie');

  waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
