import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { CardStatus } from '../../types';
import { Popover } from './Popover';
import { STATUS_CONFIG } from '../../lib/cardStatus';

const CHOICES: { value: Exclude<CardStatus, 'draft'>; hint: string }[] = [
  { value: 'collection', hint: 'Dans ta collection, pas en vente' },
  { value: 'a_vendre', hint: 'Prête à publier ou déjà en ligne' },
  { value: 'reserve', hint: 'Promise à un acheteur' },
  { value: 'vendu', hint: 'Partie' },
];

/**
 * Statut de la carte, changeable en un clic depuis l'en-tête de la fiche
 * (avant : Modifier → liste sous les champs d'identification).
 */
export function StatusMenu({
  status,
  disabled,
  onChange,
  onOpenChange,
}: {
  status: CardStatus;
  disabled?: boolean;
  onChange: (status: Exclude<CardStatus, 'draft'>) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const { label, color } = STATUS_CONFIG[status];
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Statut : ${label}. Changer le statut`}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold ring-1 ring-inset transition-colors disabled:opacity-60"
        style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, ['--tw-ring-color' as string]: `color-mix(in srgb, ${color} 30%, transparent)` }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={260} align="end">
        <div className="p-1" role="menu" aria-label="Changer le statut">
          {CHOICES.map(({ value, hint }) => {
            const c = STATUS_CONFIG[value];
            const current = value === status;
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={current}
                className="ui-menu-item"
                onClick={() => { setOpen(false); if (!current) onChange(value); }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.label}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{hint}</span>
                </span>
                {current && <Check size={15} className="shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
