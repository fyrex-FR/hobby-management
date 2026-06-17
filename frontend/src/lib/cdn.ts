/**
 * Returns the image URL as-is. R2 custom domain serves images directly
 * with CORS configured, no proxy needed.
 */
export function cdnImg(url?: string | null): string | undefined {
  if (!url) return url ?? undefined;
  return url;
}
