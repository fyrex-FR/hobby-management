/**
 * Simple same-origin proxy for R2 card images.
 * Avoids CORS issues when downloading images from the frontend.
 */

interface Env {
  R2_PUBLIC_URL?: string;
}

const DEFAULT_R2_URL = 'https://images.cardvaults.app';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;

  const raw = params.path;
  const path = Array.isArray(raw) ? raw.join('/') : raw;
  if (!path) return new Response('Not found', { status: 404 });

  const base = (env.R2_PUBLIC_URL || DEFAULT_R2_URL).replace(/\/$/, '');
  const upstream = await fetch(`${base}/${path}`);

  if (!upstream.ok) return new Response('Not found', { status: upstream.status });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
