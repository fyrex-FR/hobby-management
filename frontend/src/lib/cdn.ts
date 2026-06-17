/**
 * Rewrites R2 image URLs to same-origin /cdn/ proxy for CORS-free downloads.
 * Display in <img> tags works fine cross-origin, but fetch() for downloads needs this.
 */
const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') ?? 'https://images.cardvaults.app';
const R2_PREFIX = `${R2_PUBLIC_URL}/`;

export function cdnImg(url?: string | null): string | undefined {
  if (!url) return url ?? undefined;
  if (url.startsWith(R2_PREFIX)) {
    return `/cdn/${url.slice(R2_PREFIX.length)}`;
  }
  return url;
}
