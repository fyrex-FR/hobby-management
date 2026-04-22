import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  Upload,
  Search,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Star,
  ArrowRight
} from 'lucide-react';
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

const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all bg-white/5 border border-white/10 focus:border-[var(--accent)]/50 focus:bg-white/10 placeholder:text-white/20';

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
      className={`relative flex-1 rounded-2xl overflow-hidden border transition-all group active:scale-[0.98] ${preview
        ? 'border-white/10'
        : 'border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[var(--accent)]/50'
        }`}
      style={{ aspectRatio: '2/3.5' }}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
            <Camera size={24} className="text-white" />
            <span className="text-white text-xs font-bold uppercase tracking-widest">Changer</span>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-[var(--accent)] border border-white/5 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent)-dim] transition-all">
            <Camera size={24} strokeWidth={1.5} />
          </div>
          <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest">{label}</span>
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
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.15em] ml-1">{label}</label>
      {children}
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

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto px-6 py-10"
      >
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveView('collection')}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Ajouter une carte</h2>
              <p className="text-sm text-[var(--text-muted)] font-medium">Numérisez vos nouvelles trouvailles</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left Column: Photos & AI Actions */}
          <div className="space-y-8">
            <div className="panel p-6 rounded-3xl">
              <div className="flex items-center gap-2 mb-6">
                <Camera size={16} className="text-[var(--accent)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Scanner Haute Résolution</span>
              </div>
              <div className="flex gap-4">
                <ImageDropzone label="RECTO" file={frontFile} onChange={setFrontFile} />
                <ImageDropzone label="VERSO" file={backFile} onChange={setBackFile} />
              </div>

              <div className="mt-8">
                <button
                  onClick={handleIdentify}
                  disabled={!canIdentify || identify.isPending}
                  className={`w-full py-4 rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-3 active:scale-95 border ${!canIdentify
                    ? 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed opacity-50'
                    : identified
                      ? 'bg-green-500/10 border-green-500/20 text-green-400'
                      : 'bg-[var(--accent)] border-[var(--border-accent)] text-[#09090B] shadow-xl shadow-[var(--accent-glow)] hover:brightness-110'
                    }`}
                >
                  {identify.isPending ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : identified ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <Search size={18} />
                  )}
                  {identify.isPending ? 'ANALYSE EN COURS…' : identified ? 'RÉ-IDENTIFIER' : 'IDENTIFIER AVEC L’IA'}
                </button>
                <p className="text-[10px] text-center mt-3 text-[var(--text-muted)] font-bold uppercase tracking-widest opacity-40">
                  L'IA remplira automatiquement les champs ci-contre
                </p>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3"
              >
                <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-red-400">Erreur lors de l'enregistrement</p>
                  <p className="text-xs text-red-400/80 mt-1">{error}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Column: Information Form */}
          <div className="space-y-6">
            <div className="panel p-6 rounded-3xl space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Joueur">
                  <input className={inputCls} value={fields.player} onChange={(e) => set('player', e.target.value)} placeholder="ex: LeBron James" />
                </Field>
                <Field label="Équipe">
                  <input className={inputCls} value={fields.team} onChange={(e) => set('team', e.target.value)} placeholder="ex: Lakers" />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Année">
                  <input className={inputCls} value={fields.year} onChange={(e) => set('year', e.target.value)} placeholder="2024-25" />
                </Field>
                <Field label="Marque">
                  <input className={inputCls} value={fields.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Panini" />
                </Field>
                <Field label="Set">
                  <input className={inputCls} value={fields.set_name} onChange={(e) => set('set_name', e.target.value)} placeholder="Prizm" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Insert">
                  <input className={inputCls} value={fields.insert_name} onChange={(e) => set('insert_name', e.target.value)} placeholder="Downtown" />
                </Field>
                <Field label="Parallel">
                  <input className={inputCls} value={fields.parallel_name} onChange={(e) => set('parallel_name', e.target.value)} placeholder="Silver" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="N° Carte">
                  <input className={inputCls} value={fields.card_number} onChange={(e) => set('card_number', e.target.value)} placeholder="#23" />
                </Field>
                <Field label="Numbered">
                  <input className={inputCls} value={fields.numbered} onChange={(e) => set('numbered', e.target.value)} placeholder="/99" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Type">
                  <select className={inputCls} value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                    <option value="">—</option>
                    {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Statut">
                  <select className={inputCls} value={fields.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="collection">Collection</option>
                    <option value="a_vendre">À vendre</option>
                  </select>
                </Field>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all cursor-pointer group"
                onClick={() => setFields((prev) => ({ ...prev, is_rookie: !prev.is_rookie }))}
              >
                <div className="flex items-center gap-3">
                  <Star size={16} className={fields.is_rookie ? 'text-[var(--accent)]' : 'text-white/20'} />
                  <span className="text-xs font-bold uppercase tracking-widest text-[#FFF]">Rookie Card</span>
                </div>
                <div className={`w-10 h-5 rounded-full transition-all relative border ${fields.is_rookie ? 'bg-[var(--accent)] border-[var(--border-accent)]' : 'bg-white/10 border-white/10'}`}>
                  <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white transition-all ${fields.is_rookie ? 'right-1' : 'right-6 opacity-30 shadow-none'}`}
                    style={{ boxShadow: fields.is_rookie ? '0 0 10px rgba(255,255,255,0.5)' : 'none' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setActiveView('collection')}
                className="flex-1 py-4 rounded-2xl text-xs font-bold transition-all border border-white/5 bg-white/5 text-[var(--text-muted)] hover:bg-white/10 active:scale-95"
              >
                ANNULER
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] py-4 rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-3 bg-[var(--accent)] border border-[var(--border-accent)] text-[#09090B] shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}
                {saving ? saveStep || 'ENREGISTREMENT…' : 'ENREGISTRER LA CARTE'}
                {!saving && <ArrowRight size={18} />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
