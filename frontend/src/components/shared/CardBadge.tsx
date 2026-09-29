import type { CardType } from '../../types';

const CONFIG: Record<CardType, { label: string; color: string }> = {
  base:       { label: 'Base',       color: 'var(--text-secondary)' },
  insert:     { label: 'Insert',     color: 'var(--blue)' },
  parallel:   { label: 'Parallel',   color: 'var(--violet)' },
  numbered:   { label: 'Numbered',   color: 'var(--accent)' },
  auto:       { label: 'Auto',       color: 'var(--green)' },
  patch:      { label: 'Patch',      color: 'var(--red)' },
  auto_patch: { label: 'Auto/Patch', color: 'var(--orange)' },
};

export function CardBadge({ type }: { type: CardType | null }) {
  if (!type) return null;
  const { label, color } = CONFIG[type];
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-[10px] font-semibold ring-1 ring-inset"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        ['--tw-ring-color' as string]: `color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
