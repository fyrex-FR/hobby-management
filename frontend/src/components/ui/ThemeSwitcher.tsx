import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../lib/theme';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Système', icon: Monitor },
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
];

/** Sélecteur Système / Clair / Sombre (menus de compte). */
export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="ui-segmented w-full" role="radiogroup" aria-label="Thème">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={preference === o.value}
          data-active={preference === o.value}
          onClick={() => setPreference(o.value)}
          className="min-w-0 flex-1 justify-center !gap-1 !px-1.5"
          title={o.label}
        >
          <o.icon size={14} />
          <span className="text-xs">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Bouton icône qui alterne clair / sombre (pages sans menu de compte). */
export function ThemeToggleButton({ className = '' }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const isDark = document.documentElement.dataset.theme !== 'light';
  const next: ThemePreference = isDark ? 'light' : 'dark';
  return (
    <button
      onClick={() => setPreference(next)}
      className={`ui-btn ui-btn-ghost ui-btn-icon ${className}`}
      aria-label={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
      data-pref={preference}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
