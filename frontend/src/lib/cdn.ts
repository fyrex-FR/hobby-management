/**
 * Rewrites public Supabase Storage image URLs to the same-origin `/cdn/*`
 * proxy so they are served (and cached) by Cloudflare instead of hitting
 * Supabase egress on every request. Any non-matching URL is returned as-is.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const PUBLIC_PREFIX = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/card-images/` : '';

export function cdnImg(url?: string | null): string | undefined {
  if (!url) return url ?? undefined;
  if (PUBLIC_PREFIX && url.startsWith(PUBLIC_PREFIX)) {
    return `/cdn/${url.slice(PUBLIC_PREFIX.length)}`;
  }
  return url;
}
