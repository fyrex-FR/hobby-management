import type { CardStatus } from '../../types';

const CONFIG: Record<CardStatus, { label: string; color: string }> = {
  draft:      { label: 'Brouillon',  color: 'var(--text-secondary)' },
  collection: { label: 'Collection', color: 'var(--text-secondary)' },
  a_vendre:   { label: 'À vendre',   color: 'var(--accent)' },
  reserve:    { label: 'Réservé',    color: 'var(--blue)' },
  vendu:      { label: 'Vendu',      color: 'var(--green)' },
};

/**
 * `solid` : fond sombre opaque, pour rester lisible posé sur une photo de carte.
 */
export function StatusBadge({ status, solid = false }: { status: CardStatus; solid?: boolean }) {
  const { label, color } = CONFIG[status];
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold ${
        solid ? 'bg-black/70 ring-1 ring-white/10 backdrop-blur-sm' : 'ring-1 ring-inset'
      }`}
      style={solid ? { color } : { color, background: `color-mix(in srgb, ${color} 12%, transparent)`, ['--tw-ring-color' as string]: `color-mix(in srgb, ${color} 25%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
