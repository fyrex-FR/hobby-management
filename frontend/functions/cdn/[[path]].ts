/**
 * CDN edge cache for public Supabase Storage card images.
 *
 * Requests to `/cdn/<path>` are proxied to
 * `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/card-images/<path>`
 * and cached at the Cloudflare edge so Supabase only pays egress on the
 * first miss. Subsequent requests are served straight from Cloudflare.
 */

interface Env {
  SUPABASE_PUBLIC_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params, waitUntil } = context;

  const raw = params.path;
  const path = Array.isArray(raw) ? raw.join('/') : raw;
  if (!path) return new Response('Not found', { status: 404 });

  const base = (env.SUPABASE_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) return new Response('CDN misconfigured: missing SUPABASE_PUBLIC_URL', { status: 500 });

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const origin = `${base}/storage/v1/object/public/card-images/${path}`;
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
