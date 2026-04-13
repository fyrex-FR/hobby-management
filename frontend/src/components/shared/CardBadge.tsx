import type { CardType } from '../../types';

const CONFIG: Record<CardType, { label: string; style: string }> = {
  base:       { label: 'Base',       style: 'bg-white/5 text-[#8C8278] border border-white/5' },
  insert:     { label: 'Insert',     style: 'bg-blue-500/10 text-blue-400 border border-blue-500/15' },
  parallel:   { label: 'Parallel',   style: 'bg-purple-500/10 text-purple-400 border border-purple-500/15' },
  numbered:   { label: 'Numbered',   style: 'bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20' },
  auto:       { label: 'Auto',       style: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' },
  patch:      { label: 'Patch',      style: 'bg-red-500/10 text-red-400 border border-red-500/15' },
  auto_patch: { label: 'Auto/Patch', style: 'bg-orange-500/10 text-orange-400 border border-orange-500/15' },
};

export function CardBadge({ type }: { type: CardType | null }) {
  if (!type) return null;
  const { label, style } = CONFIG[type];
  return (
    <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide ${style}`}>
      {label}
    </span>
  );
}
