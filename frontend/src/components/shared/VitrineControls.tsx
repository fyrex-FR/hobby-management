import { useEffect, useState } from 'react';
import { Moon, Sparkles, Sun } from 'lucide-react';
import { VITRINE_STYLE_LABELS, loadBackdrop, useVitrine, type VitrineStyle } from '../../lib/vitrine';

/** Réglages « Photo vitrine » (mémorisés) : activé, style, ton, pseudo gravé. */
export function VitrineControls({ compact = false }: { compact?: boolean }) {
  const { enabled, style, tone, signature, set } = useVitrine();
  const [hasBackdrop, setHasBackdrop] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadBackdrop(tone).then((img) => { if (alive) setHasBackdrop(!!img); });
    return () => { alive = false; };
  }, [tone]);

  const styles: VitrineStyle[] = hasBackdrop ? ['studio', 'stand', 'backdrop'] : ['studio', 'stand'];
  const shownStyle = styles.includes(style) ? style : 'stand';

  return (
    <div className={`rounded-2xl border border-[var(--border)] ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-3">
        <Sparkles size={16} className="shrink-0 text-[var(--violet)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-[var(--text-primary)]">Photo vitrine</span>
          <span className="block text-xs text-[var(--text-muted)]">Carte détourée et posée sur un fond propre</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Photo vitrine"
          onClick={() => set({ enabled: !enabled })}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-hover)]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="ui-segmented" role="radiogroup" aria-label="Style">
            {styles.map((s) => (
              <button key={s} role="radio" aria-checked={shownStyle === s} data-active={shownStyle === s} onClick={() => set({ style: s })}>
                {VITRINE_STYLE_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="ui-segmented" role="radiogroup" aria-label="Ton">
            <button role="radio" aria-checked={tone === 'dark'} data-active={tone === 'dark'} onClick={() => set({ tone: 'dark' })} aria-label="Fond sombre" title="Fond sombre"><Moon size={14} /></button>
            <button role="radio" aria-checked={tone === 'light'} data-active={tone === 'light'} onClick={() => set({ tone: 'light' })} aria-label="Fond clair" title="Fond clair"><Sun size={14} /></button>
          </div>
          <input
            value={signature}
            onChange={(e) => set({ signature: e.target.value.slice(0, 24) })}
            placeholder="@ton_pseudo"
            aria-label="Pseudo gravé sur la photo"
            className="ui-input h-8 w-36 min-w-0 flex-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}
