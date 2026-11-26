import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useBulkUpdateCards, useUpdateCard, type BulkCardChanges } from '../../hooks/useCards';
import { errorMessage, toast } from '../../lib/feedback';
import { CARD_TYPE_LABELS, displayPrice } from '../../lib/collectionFilters';
import { cdnImg } from '../../lib/cdn';
import { SPORTS, type Card, type CardStatus, type CardType } from '../../types';
import { Modal } from '../ui';

/**
 * Modification groupée de la fiche : un champ laissé tel quel ne change rien,
 * un champ rempli remplace la valeur sur toutes les cartes sélectionnées.
 * Les valeurs actuelles s'affichent sous chaque champ ; un clic les applique
 * à toute la sélection (ex. harmoniser « Topps » → « Topps Flagship »).
 */

type TextKey = 'year' | 'brand' | 'set_name' | 'insert_name' | 'parallel_name' | 'numbered' | 'team';
type ChoiceKey = 'sport' | 'card_type' | 'is_rookie' | 'status';
type Key = TextKey | ChoiceKey | 'price';
/** Valeur saisie : chaîne (nouvelle valeur) ou null (vider). Absent = inchangé. */
type Edits = Partial<Record<Key, string | null>>;

const TEXT_FIELDS: { key: TextKey; label: string }[] = [
  { key: 'year', label: 'Année' },
  { key: 'brand', label: 'Marque' },
  { key: 'set_name', label: 'Set' },
  { key: 'insert_name', label: 'Insert' },
  { key: 'parallel_name', label: 'Parallèle' },
  { key: 'numbered', label: 'Tirage' },
  { key: 'team', label: 'Équipe' },
];

const STATUS_LABELS: Record<Exclude<CardStatus, 'draft'>, string> = {
  collection: 'Collection',
  a_vendre: 'À vendre',
  reserve: 'Réservé',
  vendu: 'Vendu',
};

const CHOICES: Record<ChoiceKey, { label: string; options: [string, string][] }> = {
  status: { label: 'Statut', options: Object.entries(STATUS_LABELS) },
  card_type: { label: 'Type', options: (Object.keys(CARD_TYPE_LABELS) as CardType[]).map((t) => [t, CARD_TYPE_LABELS[t]]) },
  sport: { label: 'Sport', options: SPORTS.map((s) => [s, s]) },
  is_rookie: { label: 'Rookie (RC)', options: [['true', 'Oui'], ['false', 'Non']] },
};

const REQUIRED: ReadonlySet<Key> = new Set(['sport', 'status', 'is_rookie']);
const CLEAR = '__clear';

/** Valeur d'une carte pour un champ, sous forme de texte comparable. */
function valueOf(card: Card, key: Key): string | null {
  if (key === 'price') {
    const p = displayPrice(card);
    return p == null ? null : String(p).replace('.', ',');
  }
  if (key === 'is_rookie') return card.is_rookie ? 'true' : 'false';
  if (key === 'parallel_name' && card.parallel_name === 'Base') return null;
  const v = card[key];
  return v == null || String(v).trim() === '' ? null : String(v);
}

function labelOf(key: Key, value: string): string {
  if (key === 'price') return `${value} €`;
  if (key in CHOICES) return CHOICES[key as ChoiceKey].options.find(([v]) => v === value)?.[1] ?? value;
  return value;
}

/** Valeurs présentes dans la sélection, les plus fréquentes d'abord (null = vide). */
function distinct(cards: Card[], key: Key): [string | null, number][] {
  const counts = new Map<string | null, number>();
  for (const card of cards) {
    const v = valueOf(card, key);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function parsePrice(raw: string): number | null | 'invalid' {
  const t = raw.replace(/[€\s]/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

export function BulkEditModal({
  cards,
  allCards,
  onClose,
  onDone,
}: {
  cards: Card[];
  allCards: Card[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [edits, setEdits] = useState<Edits>({});
  const [busy, setBusy] = useState(false);
  const bulkUpdate = useBulkUpdateCards();
  const updateCard = useUpdateCard();
  const n = cards.length;

  // Suggestions : les valeurs déjà utilisées dans toute la collection, pour
  // écrire « Topps Flagship » exactement comme sur les autres cartes.
  const suggestions = useMemo(() => {
    const out = {} as Record<TextKey, string[]>;
    for (const { key } of TEXT_FIELDS) {
      out[key] = distinct(allCards, key).filter(([v]) => v != null).slice(0, 60).map(([v]) => v as string);
    }
    return out;
  }, [allCards]);

  const set = (key: Key, value: string | null) => setEdits((e) => ({ ...e, [key]: value }));
  const reset = (key: Key) => setEdits((e) => {
    const next = { ...e };
    delete next[key];
    return next;
  });

  // Un champ ne compte que s'il change vraiment au moins une carte.
  const changed = (Object.keys(edits) as Key[]).filter((key) => {
    const raw = edits[key];
    const target = raw == null ? null : raw.trim() || null;
    if (key === 'price') {
      const p = raw == null ? null : parsePrice(raw);
      return p !== 'invalid' && cards.some((c) => displayPrice(c) !== p);
    }
    return cards.some((c) => valueOf(c, key) !== target);
  });
  const priceError = edits.price != null && parsePrice(edits.price) === 'invalid';

  async function apply() {
    if (!changed.length || priceError) return;
    setBusy(true);
    const ids = cards.map((c) => c.id);
    const changes: Record<string, unknown> = {};
    for (const key of changed) {
      if (key === 'price') continue;
      const raw = edits[key];
      const value = raw == null ? null : raw.trim() || null;
      changes[key] = key === 'is_rookie' ? value === 'true' : value;
    }
    const price = changed.includes('price') ? (parsePrice(edits.price ?? '') as number | null) : undefined;
    // Valeurs d'avant, carte par carte, pour « Annuler ».
    const before = cards.map((c) => ({
      id: c.id,
      changes: Object.fromEntries(Object.keys(changes).map((k) => [k, c[k as keyof Card] ?? null])),
      price: displayPrice(c),
    }));

    try {
      if (Object.keys(changes).length) await bulkUpdate.mutateAsync({ card_ids: ids, changes: changes as BulkCardChanges });
      // Le prix passe carte par carte : il est aussi poussé vers les annonces eBay.
      if (price !== undefined) await Promise.all(ids.map((id) => updateCard.mutateAsync({ id, price })));
    } catch (e) {
      toast.error('Modification incomplète', { description: errorMessage(e) });
      setBusy(false);
      return;
    }

    toast.success(`${plural(n, 'carte')} modifiée${n > 1 ? 's' : ''}`, {
      description: changed.map((k) => fieldLabel(k)).join(', '),
      action: { label: 'Annuler', onClick: () => undo(before, price !== undefined) },
    });
    onDone();
  }

  async function undo(before: { id: string; changes: Record<string, unknown>; price: number | null }[], withPrice: boolean) {
    try {
      // Regroupe les cartes qui avaient les mêmes valeurs : quelques requêtes au lieu d'une par carte.
      const groups = new Map<string, string[]>();
      for (const b of before) {
        if (!Object.keys(b.changes).length) continue;
        const k = JSON.stringify(b.changes);
        groups.set(k, [...(groups.get(k) ?? []), b.id]);
      }
      await Promise.all([...groups].map(([k, ids]) => bulkUpdate.mutateAsync({ card_ids: ids, changes: JSON.parse(k) })));
      if (withPrice) await Promise.all(before.map((b) => updateCard.mutateAsync({ id: b.id, price: b.price })));
      toast.success('Modification annulée');
    } catch (e) {
      toast.error('Annulation impossible', { description: errorMessage(e) });
    }
  }

  const fieldLabel = (key: Key) => (key === 'price' ? 'Prix' : TEXT_FIELDS.find((f) => f.key === key)?.label ?? CHOICES[key as ChoiceKey].label);

  return (
    <Modal
      onClose={busy ? () => {} : onClose}
      dismissible={!busy}
      size="lg"
      zIndex={70}
      title={`Modifier ${plural(n, 'carte')}`}
      subtitle="Seuls les champs que tu changes sont appliqués ; les autres restent tels quels."
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-[13px] text-[var(--text-secondary)]" aria-live="polite">
            {changed.length
              ? `${changed.map(fieldLabel).join(', ')} · sur ${plural(n, 'carte')}`
              : 'Aucun changement pour l’instant'}
          </p>
          <button onClick={onClose} disabled={busy} className="ui-btn">Annuler</button>
          <button onClick={apply} disabled={busy || !changed.length || priceError} className="ui-btn ui-btn-primary">
            {busy ? 'Modification…' : `Modifier ${plural(n, 'carte')}`}
          </button>
        </div>
      }
    >
      <SelectionStrip cards={cards} />

      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        {TEXT_FIELDS.map(({ key, label }) => (
          <BulkField
            key={key}
            label={label}
            values={distinct(cards, key)}
            fieldKey={key}
            value={edits[key]}
            touched={key in edits}
            onPick={(v) => set(key, v)}
            onReset={() => reset(key)}
          >
            <input
              list={`bulk-${key}`}
              value={edits[key] ?? ''}
              disabled={edits[key] === null}
              placeholder={edits[key] === null ? 'Sera vidé' : mixedPlaceholder(cards, key)}
              onChange={(e) => set(key, e.target.value)}
              aria-label={label}
              className="ui-input"
              data-changed={key in edits || undefined}
            />
            <datalist id={`bulk-${key}`}>
              {suggestions[key].map((v) => <option key={v} value={v} />)}
            </datalist>
          </BulkField>
        ))}

        <BulkField
          label="Prix de vente"
          values={distinct(cards, 'price')}
          fieldKey="price"
          value={edits.price}
          touched={'price' in edits}
          onPick={(v) => set('price', v)}
          onReset={() => reset('price')}
          error={priceError ? 'Saisis un montant, par exemple 12,50.' : undefined}
        >
          <div className="relative">
            <input
              value={edits.price ?? ''}
              disabled={edits.price === null}
              inputMode="decimal"
              placeholder={edits.price === null ? 'Sera retiré' : mixedPlaceholder(cards, 'price')}
              onChange={(e) => set('price', e.target.value)}
              aria-label="Prix de vente"
              className="ui-input tabular pr-8"
              data-changed={'price' in edits || undefined}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)]">€</span>
          </div>
        </BulkField>

        {(Object.keys(CHOICES) as ChoiceKey[]).map((key) => (
          <BulkField
            key={key}
            label={CHOICES[key].label}
            values={distinct(cards, key)}
            fieldKey={key}
            value={edits[key]}
            touched={key in edits}
            onPick={(v) => set(key, v)}
            onReset={() => reset(key)}
          >
            <select
              value={edits[key] === null ? CLEAR : edits[key] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') reset(key);
                else set(key, v === CLEAR ? null : v);
              }}
              aria-label={CHOICES[key].label}
              className="ui-select"
              data-changed={key in edits || undefined}
            >
              <option value="">Ne pas changer</option>
              {CHOICES[key].options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!REQUIRED.has(key) && <option value={CLEAR}>Aucun (vider)</option>}
            </select>
          </BulkField>
        ))}
      </div>
    </Modal>
  );
}

/** Ce que le champ vide montre : la valeur commune, ou qu'elles diffèrent, ou qu'il n'y en a pas. */
function mixedPlaceholder(cards: Card[], key: Key) {
  const values = distinct(cards, key);
  if (values.length > 1) return 'Valeurs différentes';
  return values[0]?.[0] != null ? labelOf(key, values[0][0]) : 'Vide partout';
}

/** Libellé, champ, puis valeurs actuelles cliquables (et « Vider » pour les champs facultatifs). */
function BulkField({
  label,
  fieldKey,
  values,
  value,
  touched,
  onPick,
  onReset,
  error,
  children,
}: {
  label: string;
  fieldKey: Key;
  values: [string | null, number][];
  value: string | null | undefined;
  touched: boolean;
  onPick: (value: string | null) => void;
  onReset: () => void;
  error?: string;
  children: React.ReactNode;
}) {
  const filled = values.filter((v): v is [string, number] => v[0] != null);
  const empty = values.find(([v]) => v == null)?.[1] ?? 0;
  const canClear = !REQUIRED.has(fieldKey) && filled.length > 0;
  // Une seule valeur : elle est déjà dans le champ, pas besoin de la proposer.
  const shown = values.length > 1 ? filled.slice(0, 4) : [];
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex h-5 items-center justify-between gap-2">
        <span className={`text-xs font-medium ${touched ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>{label}</span>
        {touched && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <RotateCcw size={11} /> Ne pas changer
          </button>
        )}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-[var(--red)]">{error}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label={`Valeurs actuelles : ${label}`}>
          {shown.map(([v, count]) => (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              data-active={value === v || undefined}
              title={`Mettre « ${labelOf(fieldKey, v)} » sur toute la sélection`}
              className="bulk-chip"
            >
              <span className="truncate">{labelOf(fieldKey, v)}</span>
              {values.length > 1 && <span className="tabular text-[var(--text-muted)]">{count}</span>}
            </button>
          ))}
          {shown.length > 0 && filled.length > shown.length && <span className="text-[11px] text-[var(--text-muted)]">+{filled.length - shown.length}</span>}
          {shown.length > 0 && empty > 0 && <span className="text-[11px] text-[var(--text-muted)]">{empty} vide{empty > 1 ? 's' : ''}</span>}
          {canClear && (
            <button type="button" onClick={() => onPick(null)} data-active={value === null || undefined} className="bulk-chip bulk-chip-clear">
              Vider
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Rappel visuel de la sélection : quelques vignettes, puis le reste en nombre. */
function SelectionStrip({ cards }: { cards: Card[] }) {
  const shown = cards.slice(0, 14);
  return (
    <div className="mb-5 flex items-center gap-1.5 overflow-hidden" aria-hidden>
      {shown.map((c) => (
        c.image_front_url
          ? <img key={c.id} src={cdnImg(c.image_front_url)} alt="" loading="lazy" className="h-12 w-[34px] shrink-0 rounded-[5px] object-cover" title={c.player ?? undefined} />
          : <span key={c.id} className="h-12 w-[34px] shrink-0 rounded-[5px] bg-[var(--bg-elevated)]" />
      ))}
      {cards.length > shown.length && (
        <span className="tabular ml-1 shrink-0 text-xs text-[var(--text-muted)]">+{cards.length - shown.length}</span>
      )}
    </div>
  );
}
