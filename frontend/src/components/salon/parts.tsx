import type { ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import type { Card } from '../../types';
import { cdnImg } from '../../lib/cdn';
import { RookieBadge } from '../shared/RookieBadge';

export function Thumb({ url, alt = '', className = '' }: { url: string | null | undefined; alt?: string; className?: string }) {
  return (
    <div className={`overflow-hidden bg-[var(--bg-secondary)] ${className}`}>
      {url
        ? <img src={cdnImg(url)} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        : <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]"><ImageOff size={18} /></div>}
    </div>
  );
}

/** Pastille posée sur la photo : fond sombre translucide. */
export function PhotoTag({ children, color = '#fff' }: { children: ReactNode; color?: string }) {
  return (
    <span className="dark-scope tabular inline-flex h-5 items-center rounded-md bg-black/70 px-1.5 text-[10px] font-semibold ring-1 ring-white/10" style={{ color }}>
      {children}
    </span>
  );
}

export function CardTags({ card }: { card: Card }) {
  const auto = card.card_type === 'auto' || card.card_type === 'auto_patch';
  const patch = card.card_type === 'patch' || card.card_type === 'auto_patch';
  return (
    <>
      {card.is_rookie && <RookieBadge compact />}
      {auto && <PhotoTag>Auto</PhotoTag>}
      {patch && <PhotoTag>Patch</PhotoTag>}
      {card.numbered && <PhotoTag color="var(--accent-light)">{card.numbered}</PhotoTag>}
      {card.grading_grade && <PhotoTag>{`${card.grading_company ?? ''} ${card.grading_grade}`.trim()}</PhotoTag>}
    </>
  );
}

/** Rangée défilante horizontalement, bord à bord sur mobile. */
export function ScrollRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 ${className}`}>{children}</div>;
}
