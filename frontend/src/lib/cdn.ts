/**
 * Rewrites card image URLs to the same-origin `/cdn/*` proxy so they are
 * served (and cached) by Cloudflare. Handles both legacy Supabase URLs
 * and new R2 URLs.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SUPABASE_PREFIX = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/card-images/` : '';
const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const R2_PREFIX = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/` : '';

export function cdnImg(url?: string | null): string | undefined {
  if (!url) return url ?? undefined;
  if (SUPABASE_PREFIX && url.startsWith(SUPABASE_PREFIX)) {
    return `/cdn/${url.slice(SUPABASE_PREFIX.length)}`;
  }
  if (R2_PREFIX && url.startsWith(R2_PREFIX)) {
    return `/cdn/${url.slice(R2_PREFIX.length)}`;
  }
  return url;
}
