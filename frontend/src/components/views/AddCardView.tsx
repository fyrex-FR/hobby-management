import { useRef, useState } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Star,
  ImagePlus,
} from 'lucide-react';
import { useIdentify } from '../../hooks/useIdentify';
import { useCreateCard, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { compressImage } from '../../lib/storage';
import { applyVitrine } from '../../lib/vitrine';
import { VitrineSummary } from '../shared/VitrineSettings';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { SPORTS, type CardType, type CardStatus, type Sport } from '../../types';
import { Badge, Field, Notice, Page, PageHeader, Panel } from '../ui';

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
      className={`group relative flex-1 overflow-hidden rounded-xl border transition-colors ${preview
        ? 'border-[var(--border)] bg-[var(--bg-elevated)]'
        : 'border-dashed border-[var(--border-strong)] bg-[var(--bg-secondary)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-elevated)]'
        }`}
      style={{ aspectRatio: '3/4', maxHeight: 'min(42vh, 360px)' }}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="h-full w-full object-contain" />
          <span className="absolute left-2 top-2"><Badge>{label}</Badge></span>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 dark-scope bg-black/60 py-2 text-xs font-medium text-[var(--text-primary)] opacity-0 transition-opacity group-hover:opacity-100">
            <Camera size={14} /> Changer
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]">
            <ImagePlus size={20} />
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
          <span className="text-xs text-[var(--text-muted)]">Photo ou fichier</span>
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

/** Indicateur d'étapes compact (photos → analyse → vérification → enregistrement). */
function StepIndicator({ current }: { current: number }) {
  const steps = ['Photos', 'Analyse IA', 'Vérification', 'Enregistrement'];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-4 bg-[var(--border-strong)]" />}
            <span
              className={`tabular flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                done ? 'bg-[var(--green)] text-[#06120d]' : active ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
              }`}
            >
              {done ? <CheckCircle2 size={12} /> : i + 1}
            </span>
            <span className={active ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function AddCardView() {
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [fields, setFields] = useState({
    sport: 'Basket' as Sport,
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
    is_rookie: false,
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
      sport: r.sport || prev.sport,
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
      is_rookie: r.is_rookie ?? prev.is_rookie,
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
    setSaveStep('Initialisation…');
    let createdCardId: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Non authentifié');

      const newCard = await createCard.mutateAsync({
        ...fields,
        card_type: (fields.card_type || null) as CardType | null,
        parallel_confidence: fields.parallel_confidence ? parseInt(fields.parallel_confidence) : null,
        price: fields.price ? parseFloat(fields.price) : null,
        is_rookie: fields.is_rookie,
      });
      createdCardId = newCard.id;

      async function uploadViaBackend(file: File, side: 'front' | 'back'): Promise<string> {
        // Photo vitrine appliquée à l'enregistrement seulement : l'IA a lu la photo d'origine.
        const staged = await applyVitrine(file);
        const blob = staged === file ? await compressImage(file) : staged;
        const form = new FormData();
        form.append('file', new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
        if (staged !== file) form.append('original', new File([await compressImage(file)], `${side}_orig.jpg`, { type: 'image/jpeg' }));
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
        setSaveStep('Photo Recto…');
        updates.image_front_url = await uploadViaBackend(frontFile, 'front');
      }
      if (backFile) {
        setSaveStep('Photo Verso…');
        updates.image_back_url = await uploadViaBackend(backFile, 'back');
      }

      if (Object.keys(updates).length > 0) {
        setSaveStep('Finalisation…');
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
  const step = saving ? 3 : identified ? 2 : identify.isPending ? 1 : canIdentify ? 1 : 0;

  return (
    <Page>
      <PageHeader
        title="Ajouter une carte"
        subtitle="Photographie le recto et le verso, l’IA pré-remplit la fiche."
        actions={
          <button onClick={() => setActiveView('collection')} className="ui-btn ui-btn-ghost">
            <ChevronLeft size={16} /> Collection
          </button>
        }
      />

      <StepIndicator current={step} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Colonne gauche : photos et identification */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <Panel title="Photos" icon={Camera}>
            <div className="flex gap-3">
              <ImageDropzone label="Recto" file={frontFile} onChange={setFrontFile} />
              <ImageDropzone label="Verso" file={backFile} onChange={setBackFile} />
            </div>
            <div className="mt-3">
              <VitrineSummary />
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={handleIdentify}
                disabled={!canIdentify || identify.isPending}
                className={`ui-btn ui-btn-lg w-full ${identified ? '' : 'ui-btn-primary'}`}
              >
                {identify.isPending ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : identified ? (
                  <RefreshCw size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {identify.isPending ? 'Analyse en cours…' : identified ? 'Relancer l’identification' : 'Identifier avec l’IA'}
              </button>
              {identify.isPending ? (
                <div className="space-y-1.5">
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent)]" />
                  </div>
                  <p className="text-center text-xs text-[var(--text-muted)]">Lecture du recto et du verso, quelques secondes…</p>
                </div>
              ) : identified ? (
                <Notice tone="success" icon={CheckCircle2}>Champs pré-remplis. Vérifie-les avant d’enregistrer.</Notice>
              ) : (
                <p className="text-center text-xs text-[var(--text-muted)]">
                  {canIdentify ? 'L’IA remplira automatiquement la fiche.' : 'Ajoute le recto et le verso pour lancer l’identification.'}
                </p>
              )}
            </div>
          </Panel>

          {error && (
            <Notice tone="error" icon={AlertCircle}>
              <p className="font-medium">Erreur lors de l'enregistrement</p>
              <p className="mt-0.5 text-xs opacity-90">{error}</p>
            </Notice>
          )}
        </div>

        {/* Colonne droite : fiche */}
        <div className="space-y-4">
          <Panel title="Fiche de la carte">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Sport">
                  <select className="ui-select" value={fields.sport} onChange={(e) => set('sport', e.target.value)}>
                    {SPORTS.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
                  </select>
                </Field>
                <Field label="Joueur">
                  <input className="ui-input" value={fields.player} onChange={(e) => set('player', e.target.value)} placeholder="ex: LeBron James" />
                </Field>
                <Field label="Équipe">
                  <input className="ui-input" value={fields.team} onChange={(e) => set('team', e.target.value)} placeholder="ex: Lakers" />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Année">
                  <input className="ui-input" value={fields.year} onChange={(e) => set('year', e.target.value)} placeholder="2024-25" />
                </Field>
                <Field label="Marque">
                  <input className="ui-input" value={fields.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Panini" />
                </Field>
                <Field label="Set">
                  <input className="ui-input" value={fields.set_name} onChange={(e) => set('set_name', e.target.value)} placeholder="Prizm" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Insert">
                  <input className="ui-input" value={fields.insert_name} onChange={(e) => set('insert_name', e.target.value)} placeholder="Downtown" />
                </Field>
                <Field label="Parallel">
                  <input className="ui-input" value={fields.parallel_name} onChange={(e) => set('parallel_name', e.target.value)} placeholder="Silver" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="N° carte">
                  <input className="ui-input" value={fields.card_number} onChange={(e) => set('card_number', e.target.value)} placeholder="#23" />
                </Field>
                <Field label="Tirage">
                  <input className="ui-input" value={fields.numbered} onChange={(e) => set('numbered', e.target.value)} placeholder="/99" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className="ui-select" value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                    <option value="">—</option>
                    {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Statut">
                  <select className="ui-select" value={fields.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="collection">Collection</option>
                    <option value="a_vendre">À vendre</option>
                  </select>
                </Field>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={fields.is_rookie}
                onClick={() => setFields((prev) => ({ ...prev, is_rookie: !prev.is_rookie }))}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                  <Star size={15} className={fields.is_rookie ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
                  Rookie card
                </span>
                <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${fields.is_rookie ? 'bg-[var(--accent)]' : 'bg-[var(--bg-hover)]'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${fields.is_rookie ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
              </button>
            </div>
          </Panel>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setActiveView('collection')} className="ui-btn ui-btn-lg">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary ui-btn-lg sm:min-w-56">
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
              {saving ? saveStep || 'Enregistrement…' : 'Enregistrer la carte'}
            </button>
          </div>
        </div>
      </div>
    </Page>
  );
}
