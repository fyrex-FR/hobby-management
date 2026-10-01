import { useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '../ui';
import type { FacetKey } from '../../lib/collectionFilters';
import { stripDiacritics } from '../../lib/playerName';
import { SALON_FACETS, clearFilters, toggleFacet, type SalonFacets, type SalonFilterState } from './salonFilters';

const PREVIEW = 12;

function FacetSection({ label, facetKey, data, state, onChange }: {
  label: string;
  facetKey: FacetKey;
  data: SalonFacets;
  state: SalonFilterState;
  onChange: (s: SalonFilterState) => void;
}) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const options = data.facets[facetKey] ?? [];
  if (options.length < 2 && !state.filters.facets[facetKey].length) return null;
  const selected = state.filters.facets[facetKey];
  const needle = stripDiacritics(q).toLowerCase().trim();
  const filtered = needle ? options.filter((o) => stripDiacritics(o.value).toLowerCase().includes(needle)) : options;
  // Les valeurs cochées restent toujours visibles, même hors de l'aperçu.
  const visible = all || needle ? filtered : [...filtered.slice(0, PREVIEW), ...filtered.slice(PREVIEW).filter((o) => selected.includes(o.value))];

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</h3>
        {selected.length > 0 && <span className="text-xs text-[var(--accent)]">{selected.length} choisi{selected.length > 1 ? 's' : ''}</span>}
      </div>
      {all && options.length > PREVIEW && (
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input className="ui-input pl-8" placeholder={`Chercher un ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}
      <div className="flex flex-wrap gap-1.5">
        {visible.map((o) => (
          <button
            key={o.value}
            className="ui-chip"
            data-active={selected.includes(o.value)}
            aria-pressed={selected.includes(o.value)}
            onClick={() => onChange(toggleFacet(state, facetKey, o.value))}
          >
            {o.value}<span className="count">{o.count}</span>
          </button>
        ))}
        {!visible.length && <p className="text-xs text-[var(--text-muted)]">Aucun résultat.</p>}
      </div>
      {options.length > PREVIEW && (
        <button className="text-xs font-medium text-[var(--accent)]" onClick={() => { setAll((v) => !v); setQ(''); }}>
          {all ? 'Réduire' : `Voir les ${options.length}`}
        </button>
      )}
    </section>
  );
}

/** Panneau de filtres : tout s'applique en direct, le bouton du bas montre le résultat. */
export function SalonFilterSheet({ open, onClose, state, onChange, data }: {
  open: boolean;
  onClose: () => void;
  state: SalonFilterState;
  onChange: (s: SalonFilterState) => void;
  data: SalonFacets;
}) {
  const n = data.shown.length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filtres"
      size="md"
      footer={
        <>
          <button className="ui-btn ui-btn-ghost" onClick={() => onChange(clearFilters(state))}>Tout effacer</button>
          <button className="ui-btn ui-btn-primary ui-btn-lg flex-1 sm:flex-none" onClick={onClose}>
            {n ? `Voir ${n} carte${n > 1 ? 's' : ''}` : 'Aucune carte'}
          </button>
        </>
      }
      bodyClassName="space-y-6"
    >
      <section className="space-y-2.5">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Budget max</h3>
        <div className="flex flex-wrap gap-1.5">
          <button className="ui-chip" data-active={state.budget == null} onClick={() => onChange({ ...state, budget: null })}>Tous les prix</button>
          {data.budgets.map((b) => (
            <button
              key={b.value}
              className="ui-chip"
              data-active={state.budget === b.value}
              aria-pressed={state.budget === b.value}
              disabled={!b.count && state.budget !== b.value}
              style={!b.count && state.budget !== b.value ? { opacity: 0.4 } : undefined}
              onClick={() => onChange({ ...state, budget: state.budget === b.value ? null : b.value })}
            >
              ≤ {b.value} €<span className="count">{b.count}</span>
            </button>
          ))}
        </div>
      </section>
      {SALON_FACETS.map((f) => (
        <FacetSection key={f.key} label={f.label} facetKey={f.key} data={data} state={state} onChange={onChange} />
      ))}
    </Modal>
  );
}
