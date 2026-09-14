import { describe, expect, it, vi } from 'vitest';
import { formatVintedNumberedBadge, prepareVintedPhotos } from './vintedPhotoBadge';

describe('formatVintedNumberedBadge', () => {
  it('formats a print run', () => {
    expect(formatVintedNumberedBadge('/99')).toBe('NUMÉROTÉE /99');
    expect(formatVintedNumberedBadge('25')).toBe('NUMÉROTÉE /25');
  });

  it('keeps an exact serial and ignores empty values', () => {
    expect(formatVintedNumberedBadge('12/99')).toBe('NUMÉROTÉE 12/99');
    expect(formatVintedNumberedBadge('')).toBe('');
  });
});

describe('prepareVintedPhotos', () => {
  it('annotates only the first photo and preserves order', async () => {
    const annotate = vi.fn(async () => 'front-badged');
    await expect(prepareVintedPhotos(['front', 'back'], '/99', annotate))
      .resolves.toEqual(['front-badged', 'back']);
    expect(annotate).toHaveBeenCalledWith('front', '/99');
  });

  it('does not annotate without a print run', async () => {
    const annotate = vi.fn(async () => 'unused');
    await expect(prepareVintedPhotos(['front', 'back'], '', annotate))
      .resolves.toEqual(['front', 'back']);
    expect(annotate).not.toHaveBeenCalled();
  });
});
