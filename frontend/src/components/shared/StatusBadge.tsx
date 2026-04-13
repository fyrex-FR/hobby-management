import type { CardStatus } from '../../types';

const CONFIG: Record<CardStatus, { label: string; style: string }> = {
  draft:      { label: 'Brouillon',  style: 'bg-white/5 text-[#8C8278] border border-white/5' },
  collection: { label: 'Collection', style: 'bg-white/5 text-[#8C8278] border border-white/5' },
  a_vendre:   { label: 'À vendre',   style: 'bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20' },
  reserve:    { label: 'Réservé',    style: 'bg-blue-500/10 text-blue-400 border border-blue-500/15' },
  vendu:      { label: 'Vendu',      style: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' },
};

export function StatusBadge({ status }: { status: CardStatus }) {
  const { label, style } = CONFIG[status];
  return (
    <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide ${style}`}>
      {label}
    </span>
  );
}
