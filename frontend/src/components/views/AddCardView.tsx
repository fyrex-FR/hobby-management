import { useRef, useState } from 'react';
import { useIdentify } from '../../hooks/useIdentify';
import { useCreateCard, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { compressImage } from '../../lib/storage';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import type { CardType, CardStatus } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const CARD_TYPES: { value: CardType; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'insert', label: 'Insert' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'numbered', label: 'Numbered' },
  { value: 'auto', label: 'Auto' },
  { value: 'patch', label: 'Patch' },
  { value: 'auto_patch', label: 'Auto/Patch' },
];

function ImageDropzone({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const preview = file ? URL.createObjectURL(file) : null;

  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className={`relative flex-1 rounded-2xl overflow-hidden border-2 transition-all ${
        preview
          ? 'border-white/10 hover:border-[var(--accent)]/50'
          : 'border-dashed border-white/10 hover:border-[var(--accent)]/50 bg-[var(--bg-secondary)]/50'
      }`}
      style={{ aspectRatio: '2/3' }}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm font-medium">Changer</span>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-xl">📷</div>
          <span className="text-[var(--text-secondary)] text-sm">{label}</span>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full bg-[var(--bg-secondary)] border border-white/5 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-all placeholder:text-[var(--text-muted)]';

function ErrorAlert({ title, message }: { title: string; message: string }) {
  return (
    <div
      className="mt-6 rounded-2xl p-4"
      style={{ background: 'rgba(127,29,29,0.28)', border: '1px solid rgba(248,113,113,0.35)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
          style={{ background: 'rgba(248,113,113,0.16)', color: '#fca5a5' }}
        >
          !
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#fecaca' }}>{title}</p>
          <p className="text-sm mt-1 whitespace-pre-wrap break-words" style={{ color: '#fca5a5' }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AddCardView() {
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [fields, setFields] = useState({
    player: '',
    team: '',
    year: '',
    brand: '',
    set_name: '',
    card_type: '' as CardType | '',
    insert_name: '',
    parallel_name: '',
    parallel_confidence: '',
    card_number: '',
    numbered: '',
    condition_notes: '',
    status: 'collection' as CardStatus,
    price: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveStep, setSaveStep] = useState('');
  const [error, setError] = useState('');

  const identify = useIdentify();
  const createCard = useCreateCard();
  const deleteCard = useDeleteCard();
  const updateCard = useUpdateCard();
  const setActiveView = useAppStore((s) => s.setActiveView);

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function applyAIResult(r: Parameters<typeof identify.mutateAsync>[0] extends infer _P ? Awaited<ReturnType<typeof identify.mutateAsync>> : never) {
    setFields((prev) => ({
      ...prev,
      player: r.player || prev.player,
      team: r.team || prev.team,
      year: r.year || prev.year,
      brand: r.brand || prev.brand,
      set_name: r.set || prev.set_name,
      card_type: r.card_type || prev.card_type,
      insert_name: r.insert || prev.insert_name,
      parallel_name: r.parallel || prev.parallel_name,
      parallel_confidence: r.parallel_confidence?.toString() || prev.parallel_confidence,
      card_number: r.card_number || prev.card_number,
      numbered: r.numbered || prev.numbered,
      condition_notes: r.condition_notes || prev.condition_notes,
    }));
  }

  async function handleIdentify() {
    if (!frontFile || !backFile) return;
    setError('');
    try {
      const result = await identify.mutateAsync({ frontFile, backFile });
      applyAIResult(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    setSaveStep('Création de la carte…');
    let createdCardId: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Non authentifié');

      const newCard = await createCard.mutateAsync({
        ...fields,
        card_type: (fields.card_type || null) as CardType | null,
        parallel_confidence: fields.parallel_confidence ? parseInt(fields.parallel_confidence) : null,
        price: fields.price ? parseFloat(fields.price) : null,
      });
      createdCardId = newCard.id;

      async function uploadViaBackend(file: File, side: 'front' | 'back'): Promise<string> {
        const blob = await compressImage(file);
        const form = new FormData();
        form.append('file', new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
        form.append('card_id', newCard.id);
        form.append('side', side);
        const resp = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.session!.access_token}` },
          body: form,
        });
        if (!resp.ok) throw new Error(`Upload failed: ${await resp.text()}`);
        return (await resp.json()).url;
      }

      const updates: Record<string, string> = {};
      if (frontFile) {
        setSaveStep('Upload de la photo avant…');
        updates.image_front_url = await uploadViaBackend(frontFile, 'front');
      }
      if (backFile) {
        setSaveStep('Upload de la photo arrière…');
        updates.image_back_url = await uploadViaBackend(backFile, 'back');
      }

      if (Object.keys(updates).length > 0) {
        setSaveStep('Enregistrement des photos…');
        await updateCard.mutateAsync({
          id: newCard.id,
          ...updates,
        });
      }

      setActiveView('collection');
    } catch (e) {
      const message = (e as Error).message;
      if (createdCardId) {
        try {
          await deleteCard.mutateAsync(createdCardId);
        } catch {
          setError(`Échec pendant "${saveStep || 'l’enregistrement'}". La carte a peut-être été créée partiellement. Détail: ${message}`);
          return;
        }
        setError(`Échec pendant "${saveStep || 'l’enregistrement'}". La carte créée a été supprimée pour éviter un enregistrement incomplet. Détail: ${message}`);
        return;
      }
      setError(message);
    } finally {
      setSaving(false);
      setSaveStep('');
    }
  }

  const canIdentify = !!frontFile && !!backFile;
  const identified = identify.isSuccess;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setActiveView('collection')}
            className="text-[var(--text-secondary)] hover:text-white transition-colors text-sm"
          >
            ← Collection
          </button>
          <span className="text-[var(--text-muted)]">/</span>
          <h2 className="text-white font-semibold">Ajouter une carte</h2>
        </div>

        {/* Photos */}
        <div className="mb-8">
          <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">Photos</p>
          <div className="flex gap-4" style={{ height: '280px' }}>
            <ImageDropzone label="Face" file={frontFile} onChange={setFrontFile} />
            <ImageDropzone label="Dos" file={backFile} onChange={setBackFile} />
          </div>
        </div>

        {/* Identify button */}
        <button
          onClick={handleIdentify}
          disabled={!canIdentify || identify.isPending}
          className={`w-full mb-8 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            !canIdentify
              ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed border border-white/5'
              : identified
              ? 'bg-green-900/40 border border-green-700/40 text-green-400'
              : 'bg-[var(--accent)] hover:opacity-90 text-white shadow-lg shadow-orange-500/20'
          }`}
        >
          {identify.isPending ? (
            <>
              <span className="animate-spin">⟳</span>
              Identification en cours…
            </>
          ) : identified ? (
            <>✓ Identifiée — cliquer pour ré-identifier</>
          ) : (
            <>🔍 Identifier avec l'IA</>
          )}
        </button>

        {/* Form */}
        <div className="space-y-6">
          {/* Joueur / Équipe */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Joueur">
              <input className={inputClass} value={fields.player} onChange={(e) => set('player', e.target.value)} placeholder="LeBron James" />
            </Field>
            <Field label="Équipe">
              <input className={inputClass} value={fields.team} onChange={(e) => set('team', e.target.value)} placeholder="Los Angeles Lakers" />
            </Field>
          </div>

          {/* Carte */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Année">
              <input className={inputClass} value={fields.year} onChange={(e) => set('year', e.target.value)} placeholder="2024-25" />
            </Field>
            <Field label="Marque">
              <input className={inputClass} value={fields.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Panini" />
            </Field>
            <Field label="Set">
              <input className={inputClass} value={fields.set_name} onChange={(e) => set('set_name', e.target.value)} placeholder="Prizm" />
            </Field>
          </div>

          {/* Insert / Parallel */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Insert">
              <input className={inputClass} value={fields.insert_name} onChange={(e) => set('insert_name', e.target.value)} placeholder="Downtown" />
            </Field>
            <Field label="Parallel">
              <input className={inputClass} value={fields.parallel_name} onChange={(e) => set('parallel_name', e.target.value)} placeholder="Silver Prizm" />
            </Field>
          </div>

          {/* Numéro / Tirage / Type */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="N° carte">
              <input className={inputClass} value={fields.card_number} onChange={(e) => set('card_number', e.target.value)} placeholder="#45" />
            </Field>
            <Field label="Tirage">
              <input className={inputClass} value={fields.numbered} onChange={(e) => set('numbered', e.target.value)} placeholder="/99" />
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                value={fields.card_type}
                onChange={(e) => set('card_type', e.target.value)}
              >
                <option value="">—</option>
                {CARD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Statut / Prix */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Statut">
              <select className={inputClass} value={fields.status} onChange={(e) => set('status', e.target.value)}>
                <option value="collection">Collection</option>
                <option value="a_vendre">À vendre</option>
                <option value="reserve">Réservé</option>
                <option value="vendu">Vendu</option>
              </select>
            </Field>
            <Field label="Prix (€)">
              <input className={inputClass} type="number" value={fields.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" />
            </Field>
          </div>

          {/* État */}
          <Field label="Notes d'état">
            <input className={inputClass} value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} placeholder="Mint — laisser vide si parfait état" />
          </Field>
        </div>

        {error && <ErrorAlert title="Enregistrement impossible" message={error} />}

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={() => setActiveView('collection')}
            className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/5 text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-white shadow-lg shadow-orange-500/20 transition-all"
          >
            {saving ? saveStep || 'Enregistrement…' : 'Enregistrer la carte'}
          </button>
        </div>
      </div>
    </div>
  );
}
