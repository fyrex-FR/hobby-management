import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCcw,
  Save,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
} from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import {
  matchShippingRule,
  useEbayAccountStatus,
  useEbayApplyImageToListings,
  useEbayConnect,
  useEbayDisconnect,
  useEbayLocationCreate,
  useEbayPublishBatch,
  useEbaySellerImage,
  useEbaySellerImageSave,
  useEbaySellerSetup,
  useEbayShippingRules,
  useEbayShippingRulesSave,
} from '../../hooks/useEbayAccount';
import type { EbayApplyImageError, EbayPolicyOption, EbayPublishResult, EbayShippingRule } from '../../hooks/useEbayAccount';
import { useQueryClient } from '@tanstack/react-query';
import { EbayLogo } from '../shared/EbayLogo';
import { cdnImg } from '../../lib/cdn';
import { downloadImage } from '../../lib/downloadImage';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/storage';
import type { Card } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function StatTile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: boolean }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col items-start gap-3">
      <div className={`p-2 rounded-xl ${accent ? 'bg-[var(--accent-glow)]' : 'bg-white/5'}`}>
        <Icon size={18} className={accent ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">{label}</span>
        <span className="text-2xl font-black tabular-nums tracking-tight mt-0.5" style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function SetupStep({
  title,
  detail,
  done,
  icon: Icon,
}: {
  title: string;
  detail: string;
  done?: boolean;
  icon: any;
}) {
  return (
    <div className="flex gap-3 rounded-2xl p-3" style={{ background: done ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)' }}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: done ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)' }}
      >
        <Icon size={17} style={{ color: done ? 'var(--green)' : 'var(--accent)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {done ? <CheckCircle2 size={14} style={{ color: 'var(--green)' }} /> : <AlertCircle size={14} style={{ color: 'var(--accent)' }} />}
          <p className="text-sm font-bold text-white">{title}</p>
        </div>
        <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-muted)' }}>{detail}</p>
      </div>
    </div>
  );
}

const APPLY_IMAGE_BATCH = 20;

function SellerImageCard() {
  const { data: settings, isLoading } = useEbaySellerImage();
  const save = useEbaySellerImageSave();
  const applyBatch = useEbayApplyImageToListings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [applyError, setApplyError] = useState('');
  const [applySummary, setApplySummary] = useState<{ updated: number; skipped: number; errors: EbayApplyImageError[] } | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    setError('');
    setUploading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Session expirée, reconnecte-toi.');
      const blob = await compressImage(file);
      const form = new FormData();
      form.append('file', new File([blob], 'seller-image.jpg', { type: 'image/jpeg' }));
      form.append('card_id', 'ebay-seller-image');
      form.append('side', 'extra');
      const r = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!r.ok) throw new Error(await r.text());
      const { url } = await r.json();
      await save.mutateAsync(url);
    } catch (e) {
      setError((e as Error).message || 'Envoi de l’image impossible.');
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    setError('');
    save.mutate(null, { onError: (e) => setError((e as Error).message) });
  }

  async function handleDownload() {
    if (!imageUrl) return;
    setError('');
    setDownloading(true);
    try {
      await downloadImage(imageUrl, 'image-annonce-ebay.jpg');
    } catch (e) {
      setError((e as Error).message || 'Téléchargement impossible.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyLink() {
    if (!imageUrl) return;
    setError('');
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError((e as Error).message || 'Copie du lien impossible.');
    }
  }

  async function handleApplyToListings() {
    setApplyError('');
    setApplySummary(null);
    setApplying(true);
    let offset = 0;
    let updated = 0;
    let skipped = 0;
    let errors: EbayApplyImageError[] = [];
    try {
      for (;;) {
        const result = await applyBatch.mutateAsync({ offset, batch: APPLY_IMAGE_BATCH });
        if ('connected' in result) {
          setApplyError('Connecte d’abord ton compte eBay.');
          return;
        }
        updated += result.updated;
        skipped += result.skipped;
        errors = errors.concat(result.errors);
        setApplyProgress({ done: Math.min(result.next_offset, result.total), total: result.total });
        offset = result.next_offset;
        if (result.done) break;
      }
      setApplySummary({ updated, skipped, errors });
    } catch (e) {
      setApplySummary(updated || skipped || errors.length ? { updated, skipped, errors } : null);
      setApplyError((e as Error).message || 'Erreur réseau pendant le traitement.');
    } finally {
      setApplying(false);
      setApplyProgress(null);
    }
  }

  const imageUrl = settings?.extra_image_url ?? null;
  const busy = uploading || save.isPending;

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ImagePlus size={18} style={{ color: imageUrl ? 'var(--green)' : 'var(--accent)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Image d’annonce</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Ajoutée automatiquement en 3e photo de chaque annonce publiée
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      ) : imageUrl ? (
        <div className="flex flex-col gap-3">
          <img src={cdnImg(imageUrl)} alt="Image vendeur" className="max-h-40 w-auto rounded-xl object-contain self-start" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="flex items-center flex-wrap gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              Remplacer
            </button>
            <button
              onClick={handleDownload}
              disabled={busy || downloading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}
            >
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Télécharger
            </button>
            <button
              onClick={handleCopyLink}
              disabled={busy}
              className="flex items-center gap-2 text-xs font-bold disabled:opacity-50"
              style={{ color: copied ? 'var(--green)' : 'var(--text-secondary)' }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copié ✓' : 'Copier le lien'}
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-2 text-xs font-bold disabled:opacity-50"
              style={{ color: 'var(--red)' }}
            >
              <Trash2 size={13} />
              Retirer
            </button>
          </div>

          <div className="flex flex-col gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={handleApplyToListings}
              disabled={applying || busy}
              className="self-start flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 mt-3"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
            >
              {applying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              {applying
                ? applyProgress
                  ? `Traitement… ${applyProgress.done}/${applyProgress.total} annonces`
                  : 'Traitement…'
                : 'Ajouter à mes annonces existantes'}
            </button>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Uploade l’image dans le système photo eBay puis l’ajoute à chacune de tes annonces actives déjà en ligne. Opération sans risque à relancer : les annonces déjà mises à jour sont détectées et ignorées automatiquement.
            </p>
            {applyError && <p className="text-xs" style={{ color: 'var(--red)' }}>{applyError}</p>}
            {applySummary && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-bold" style={{ color: 'var(--green)' }}>
                  ✅ {applySummary.updated} mise{applySummary.updated > 1 ? 's' : ''} à jour · {applySummary.skipped} avaient déjà l’image
                  {applySummary.errors.length > 0 ? ` · ${applySummary.errors.length} échec${applySummary.errors.length > 1 ? 's' : ''}` : ''}
                </p>
                {applySummary.errors.length > 0 && (
                  <ul className="flex flex-col gap-0.5 max-h-32 overflow-y-auto rounded-lg px-2 py-1.5" style={{ background: 'rgba(239,68,68,0.06)' }}>
                    {applySummary.errors.map((err, i) => (
                      <li key={`${err.item_id}-${i}`} className="text-[11px]" style={{ color: 'var(--red)' }}>
                        {(err.title || err.item_id)} — {err.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Pour tes annonces créées directement sur eBay : télécharge l’image puis ajoute-la via l’éditeur photo eBay (eBay n’accepte pas les liens externes dans une annonce existante), ou utilise le bouton ci-dessus qui le fait automatiquement.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Ajoutée automatiquement en 3e photo de chaque annonce publiée — présente tes conditions d’envoi, ta protection des cartes, etc.
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="self-start flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#09090B' }}
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
            {uploading ? 'Envoi…' : 'Ajouter une image'}
          </button>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}

interface RuleRow {
  key: string;
  maxPrice: string; // '' = tranche « et au-delà »
  policyId: string;
}

let ruleRowSeq = 0;
const newRuleRow = (maxPrice = '', policyId = ''): RuleRow => ({ key: `r${ruleRowSeq++}`, maxPrice, policyId });

function ShippingRulesCard({ fulfillmentOptions }: { fulfillmentOptions: EbayPolicyOption[] }) {
  const { data, isLoading } = useEbayShippingRules();
  const saveRules = useEbayShippingRulesSave();
  const [rows, setRows] = useState<RuleRow[] | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Initialise les lignes depuis les règles enregistrées (une seule fois).
  useEffect(() => {
    if (rows !== null || !data) return;
    const loaded = data.rules.map((r) => newRuleRow(r.max_price == null ? '' : String(r.max_price), r.fulfillment_policy_id));
    setRows(loaded.length ? loaded : [newRuleRow('', '')]);
  }, [data, rows]);

  const current = rows ?? [];
  const policyName = (id: string) => fulfillmentOptions.find((p) => p.id === id)?.name || '—';

  function update(key: string, patch: Partial<RuleRow>) {
    setSaved(false);
    setRows((rs) => (rs ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setSaved(false);
    setRows((rs) => [...(rs ?? []), newRuleRow('', '')]);
  }
  function removeRow(key: string) {
    setSaved(false);
    setRows((rs) => (rs ?? []).filter((r) => r.key !== key));
  }

  function save() {
    setError('');
    setSaved(false);
    const filled = current.filter((r) => r.policyId);
    if (filled.some((r) => !r.policyId)) {
      setError('Choisis une politique d’expédition pour chaque tranche.');
      return;
    }
    const capped = filled.filter((r) => r.maxPrice.trim() !== '');
    const openEnded = filled.filter((r) => r.maxPrice.trim() === '');
    if (openEnded.length > 1) {
      setError('Une seule tranche « et au-delà » (sans montant) est autorisée.');
      return;
    }
    const parsed = capped.map((r) => ({ ...r, value: parseFloat(r.maxPrice) }));
    if (parsed.some((r) => !(r.value > 0))) {
      setError('Chaque seuil doit être un montant positif.');
      return;
    }
    parsed.sort((a, b) => a.value - b.value);
    if (parsed.some((r, i) => i > 0 && r.value === parsed[i - 1].value)) {
      setError('Deux tranches ne peuvent pas avoir le même seuil.');
      return;
    }
    const rules: EbayShippingRule[] = [
      ...parsed.map((r) => ({ max_price: r.value, fulfillment_policy_id: r.policyId })),
      ...openEnded.map((r) => ({ max_price: null, fulfillment_policy_id: r.policyId })),
    ];
    saveRules.mutate(rules, {
      onSuccess: () => {
        setSaved(true);
        setRows([
          ...parsed.map((r) => newRuleRow(String(r.value), r.policyId)),
          ...openEnded.map((r) => newRuleRow('', r.policyId)),
        ]);
      },
      onError: (e) => setError((e as Error).message),
    });
  }

  const configuredCount = current.filter((r) => r.policyId).length;

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Truck size={18} style={{ color: configuredCount > 0 ? 'var(--green)' : 'var(--accent)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Règles de livraison</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Le bon mode d’envoi pré-sélectionné selon le prix, à la publication
          </p>
        </div>
      </div>

      {fulfillmentOptions.length === 0 ? (
        <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--accent)' }}>
          Configure d’abord tes politiques d’expédition sur eBay (une par mode : lettre suivie, colis R1, R2…) pour pouvoir les associer à des tranches de prix ici.
        </p>
      ) : isLoading || rows === null ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Chaque tranche s’applique aux prix <b>jusqu’à</b> son seuil inclus. Laisse le montant vide pour la tranche « et au-delà ». Au moment de publier, la politique d’expédition est choisie automatiquement d’après le prix (toujours modifiable).
          </p>

          <div className="flex flex-col gap-2">
            {current.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_1.4fr_auto] gap-2 items-center">
                <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                  <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--text-muted)' }}>≤</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={row.maxPrice}
                    onChange={(e) => update(row.key, { maxPrice: e.target.value })}
                    placeholder="au-delà"
                    className="w-full bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--text-muted)' }}>€</span>
                </div>
                <select
                  value={row.policyId}
                  onChange={(e) => update(row.key, { policyId: e.target.value })}
                  className="w-full rounded-xl px-2.5 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="">Choisir un envoi…</option>
                  {fulfillmentOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeRow(row.key)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0 transition-colors hover:bg-white/5"
                  style={{ color: 'var(--red)' }}
                  aria-label="Supprimer la tranche"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            className="self-start flex items-center gap-1.5 text-xs font-bold"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Plus size={13} /> Ajouter une tranche
          </button>

          {current.length > 0 && (
            <p className="text-[11px] leading-relaxed rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
              Aperçu :{' '}
              {[...current]
                .filter((r) => r.policyId)
                .sort((a, b) => {
                  const av = a.maxPrice.trim() === '' ? Infinity : parseFloat(a.maxPrice);
                  const bv = b.maxPrice.trim() === '' ? Infinity : parseFloat(b.maxPrice);
                  return av - bv;
                })
                .map((r, i, arr) => {
                  const prev = i > 0 ? arr[i - 1].maxPrice : '';
                  const lo = prev.trim() === '' ? 0 : parseFloat(prev);
                  const label = r.maxPrice.trim() === ''
                    ? `> ${lo} €`
                    : i === 0 ? `≤ ${parseFloat(r.maxPrice)} €` : `${lo}–${parseFloat(r.maxPrice)} €`;
                  return `${label} → ${policyName(r.policyId)}`;
                })
                .join('  ·  ') || '—'}
            </p>
          )}

          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

          <button
            onClick={save}
            disabled={saveRules.isPending}
            className="self-start flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#09090B' }}
          >
            {saveRules.isPending ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saveRules.isPending ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer les règles'}
          </button>
        </div>
      )}
    </div>
  );
}

function BulkPublishCard({ readyCards, fulfillmentOptions }: { readyCards: Card[]; fulfillmentOptions: EbayPolicyOption[] }) {
  const { data: rulesData } = useEbayShippingRules();
  const { data: sellerImage } = useEbaySellerImage();
  const publishBatch = useEbayPublishBatch();
  const qc = useQueryClient();
  const rules: EbayShippingRule[] = rulesData?.rules ?? [];
  const hasImage = Boolean(sellerImage?.extra_image_url);

  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [includeImage, setIncludeImage] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<EbayPublishResult[] | null>(null);
  const [error, setError] = useState('');

  const selected = readyCards.filter((c) => !deselected.has(c.id));
  const resultById = new Map((results ?? []).map((r) => [r.card_id, r]));

  function shippingName(price: number | null): string {
    const id = price != null ? matchShippingRule(rules, price) : null;
    if (!id) return 'Défaut du compte';
    return fulfillmentOptions.find((p) => p.id === id)?.name || 'Défaut du compte';
  }

  function toggle(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const BATCH = 5;
  async function publishSelected() {
    const ids = selected.map((c) => c.id);
    if (!ids.length) return;
    setPublishing(true);
    setError('');
    setResults(null);
    setProgress({ done: 0, total: ids.length });
    let all: EbayPublishResult[] = [];
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        const res = await publishBatch.mutateAsync({ card_ids: slice, include_extra_image: hasImage && includeImage });
        if ('connected' in res) {
          setError('Connecte d’abord ton compte eBay.');
          break;
        }
        all = all.concat(res.results);
        setResults(all);
        setProgress({ done: Math.min(i + BATCH, ids.length), total: ids.length });
      }
      qc.invalidateQueries({ queryKey: ['cards'] });
    } catch (e) {
      setError((e as Error).message || 'Erreur réseau pendant la publication.');
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  }

  const published = (results ?? []).filter((r) => r.status === 'published').length;
  const skipped = (results ?? []).filter((r) => r.status === 'skipped').length;
  const failed = (results ?? []).filter((r) => r.status === 'error').length;

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ShoppingBag size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Publier en masse</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {readyCards.length} carte{readyCards.length > 1 ? 's' : ''} prête{readyCards.length > 1 ? 's' : ''} · titre, catégorie et livraison automatiques
          </p>
        </div>
      </div>

      {fulfillmentOptions.length === 0 ? (
        <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--accent)' }}>
          Configure d’abord tes options de vente eBay (paiement, livraison, retours) pour pouvoir publier.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Chaque carte est publiée avec son prix déjà saisi, un titre et une catégorie générés, et le mode d’envoi choisi selon tes règles de livraison. Décoche celles à ne pas publier.
          </p>

          <div className="flex flex-col gap-1 max-h-80 overflow-y-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
            {readyCards.map((card) => {
              const res = resultById.get(card.id);
              const checked = !deselected.has(card.id);
              return (
                <label
                  key={card.id}
                  className="flex items-center gap-3 py-2 px-2.5 rounded-xl cursor-pointer transition-colors hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={publishing || res?.status === 'published'}
                    onChange={() => toggle(card.id)}
                    className="w-4 h-4 accent-[var(--accent)] shrink-0"
                  />
                  {card.image_front_url ? (
                    <img src={cdnImg(card.image_front_url)} alt="" className="w-8 h-11 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className="w-8 h-11 rounded-lg shrink-0 flex items-center justify-center text-xs" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{card.player ?? '—'}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {[card.year, shippingName(card.price)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {res ? (
                    <span
                      className="text-[11px] font-bold shrink-0"
                      style={{ color: res.status === 'published' ? 'var(--green)' : res.status === 'skipped' ? 'var(--text-muted)' : 'var(--red)' }}
                    >
                      {res.status === 'published' ? '✓ Publiée' : res.status === 'skipped' ? 'Ignorée' : 'Échec'}
                    </span>
                  ) : card.price != null ? (
                    <span className="text-sm font-black shrink-0" style={{ color: 'var(--accent)' }}>{card.price} €</span>
                  ) : (
                    <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--red)' }}>Sans prix</span>
                  )}
                </label>
              );
            })}
          </div>

          {hasImage && (
            <label className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <input
                type="checkbox"
                checked={includeImage}
                disabled={publishing}
                onChange={(e) => setIncludeImage(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-medium text-white">Ajouter mon image d’annonce (3e photo)</span>
            </label>
          )}

          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

          {results && !publishing && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-bold" style={{ color: 'var(--green)' }}>
                ✅ {published} publiée{published > 1 ? 's' : ''}
                {skipped > 0 ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''}` : ''}
                {failed > 0 ? ` · ${failed} échec${failed > 1 ? 's' : ''}` : ''}
              </p>
              {failed > 0 && (
                <ul className="flex flex-col gap-0.5 max-h-32 overflow-y-auto rounded-lg px-2 py-1.5" style={{ background: 'rgba(239,68,68,0.06)' }}>
                  {(results ?? []).filter((r) => r.status === 'error').map((r) => (
                    <li key={r.card_id} className="text-[11px]" style={{ color: 'var(--red)' }}>
                      {(r.title || r.card_id)} — {r.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            onClick={publishSelected}
            disabled={publishing || selected.length === 0}
            className="self-start flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#09090B' }}
          >
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <EbayLogo width={32} height={13} mono="#09090B" />}
            {publishing
              ? progress
                ? `Publication… ${progress.done}/${progress.total}`
                : 'Publication…'
              : `Publier la sélection (${selected.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

export function EbayView() {
  const { data: cards = [] } = useCards();
  const { data: status, isLoading } = useEbayAccountStatus();
  const { data: setup } = useEbaySellerSetup(Boolean(status?.connected));
  const connect = useEbayConnect();
  const disconnect = useEbayDisconnect();
  const createLocation = useEbayLocationCreate();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');

  // Retour du flux OAuth (?ebay=connected | ?ebay=error&reason=...), nettoie l'URL ensuite.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ebay = params.get('ebay');
    if (!ebay) return;
    if (ebay === 'connected') {
      setNotice({ kind: 'success', text: 'Compte eBay connecté avec succès.' });
    } else if (ebay === 'error') {
      setNotice({ kind: 'error', text: `Connexion eBay impossible : ${params.get('reason') || 'erreur inconnue'}` });
    }
    params.delete('ebay');
    params.delete('reason');
    const query = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
  }, []);

  const listed = useMemo(() => cards.filter((c) => c.ebay_url), [cards]);
  const readyNotListed = useMemo(
    () => cards.filter((c) => c.status === 'a_vendre' && !c.ebay_url),
    [cards],
  );
  const location = setup?.locations?.[0];
  const policies = setup?.policies;
  const hasLocation = Boolean(location);
  const hasPolicies = Boolean(policies?.configured);

  useEffect(() => {
    const address = location?.location?.address;
    if (!address) return;
    if (address.postalCode) setPostalCode(address.postalCode);
    if (address.city) setCity(address.city);
  }, [location]);

  function saveLocation() {
    createLocation.mutate(
      { postal_code: postalCode.trim(), city: city.trim(), country: 'FR', name: 'CardVaults' },
      {
        onSuccess: () => setNotice({ kind: 'success', text: 'Lieu d’expédition eBay enregistré.' }),
        onError: (e) => setNotice({ kind: 'error', text: (e as Error).message }),
      },
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <EbayLogo width={56} height={22} />
        <div>
          <h1 className="text-xl font-black text-white leading-tight">Centre de contrôle eBay</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Connexion, statut et cartes en vente</p>
        </div>
      </motion.div>

      {notice && (
        <div
          className="rounded-2xl px-4 py-3 text-sm font-medium"
          style={{
            background: notice.kind === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: notice.kind === 'success' ? 'var(--green)' : 'var(--red)',
          }}
        >
          {notice.text}
        </div>
      )}

      <div className="glass rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-black text-white">Avant de publier</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Chaque vendeur configure son propre compte eBay. CardVaults utilise ensuite ces réglages pour créer l’annonce avec la bonne catégorie sport, l’état carte adapté, le lieu d’expédition et les options de vente eBay.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SetupStep
            icon={Link2}
            done={Boolean(status?.connected)}
            title="Compte eBay connecté"
            detail="Connexion OAuth obligatoire : l’annonce est publiée sur le compte du vendeur connecté, pas sur un compte global."
          />
          <SetupStep
            icon={MapPin}
            done={hasLocation}
            title="Lieu d’expédition"
            detail="Code postal et ville à enregistrer dans CardVaults. Cela crée une location eBay active propre au compte vendeur."
          />
          <SetupStep
            icon={CreditCard}
            done={hasPolicies}
            title="Paiement, livraison et retours"
            detail="eBay doit avoir une policy de paiement, une policy de livraison et une policy de retours sur EBAY_FR. Tu choisis lesquelles utiliser dans la modale de publication."
          />
          <SetupStep
            icon={Camera}
            done={readyNotListed.length > 0 || listed.length > 0}
            title="Cartes prêtes"
            detail="Avant publication : photo recto, prix positif, titre 80 caractères max et description 5000 caractères max. Titre et description restent modifiables dans la modale."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
            <Truck size={14} style={{ color: 'var(--accent)' }} />
            Expédition depuis le lieu vendeur
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
            <Tag size={14} style={{ color: 'var(--accent)' }} />
            Catégorie sport prioritaire
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
            <FileText size={14} style={{ color: 'var(--accent)' }} />
            Description générée puis éditable
          </div>
        </div>
        {status?.connected && policies && !policies.configured && (
          <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)' }}>
            À configurer côté eBay : {[!policies.payment && 'paiement', !policies.fulfillment && 'livraison', !policies.return && 'retours'].filter(Boolean).join(', ')}.
          </p>
        )}
      </div>

      <SellerImageCard />

      {status?.connected && (
        <ShippingRulesCard fulfillmentOptions={policies?.options?.fulfillment ?? []} />
      )}

      {status?.connected && readyNotListed.length > 0 && (
        <BulkPublishCard readyCards={readyNotListed} fulfillmentOptions={policies?.options?.fulfillment ?? []} />
      )}

      {/* Statut de connexion */}
      {isLoading ? (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        </div>
      ) : status?.connected ? (
        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <CheckCircle2 size={22} style={{ color: 'var(--green)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  Connecté{status.ebay_username ? ` en tant que ${status.ebay_username}` : ''}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Marketplace {status.marketplace_id || 'EBAY_FR'}
                  {status.connected_at ? ` · depuis le ${new Date(status.connected_at).toLocaleDateString('fr-FR')}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shrink-0"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}
            >
              <LogOut size={15} />
              {disconnect.isPending ? 'Déconnexion…' : 'Déconnecter'}
            </button>
          </div>

          <div className="glass rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <MapPin size={18} style={{ color: location ? 'var(--green)' : 'var(--accent)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Lieu d’expédition</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {location
                    ? `${location.name || location.merchantLocationKey} · ${location.location?.address?.postalCode || ''} ${location.location?.address?.city || ''}`
                    : 'Requis pour publier sur eBay'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2">
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Code postal"
                inputMode="numeric"
                className="rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ville"
                className="rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={saveLocation}
                disabled={createLocation.isPending || !postalCode.trim() || !city.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#09090B' }}
              >
                {createLocation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Connecte ton compte eBay pour publier tes cartes directement depuis
            CardVaults. Chaque utilisateur connecte son propre compte — tes
            annonces sont publiées en ton nom.
          </p>
          {connect.error && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>{(connect.error as Error).message}</p>
          )}
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="self-start py-3 px-5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#09090B' }}
          >
            {connect.isPending ? 'Redirection…' : 'Connecter mon compte eBay'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Sur eBay" value={listed.length} icon={ShoppingBag} accent={listed.length > 0} />
        <StatTile label="Prêtes, pas encore listées" value={readyNotListed.length} icon={Tag} accent={readyNotListed.length > 0} />
      </div>

      {/* Cartes déjà sur eBay */}
      {listed.length > 0 && (
        <div className="glass rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 px-1 pb-2">
            <PackageCheck size={14} className="text-[var(--text-muted)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Cartes sur eBay ({listed.length})
            </span>
          </div>
          {listed.map((card) => (
            <a
              key={card.id}
              href={card.ebay_url!}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 py-2 px-1.5 rounded-xl transition-colors hover:bg-white/5"
            >
              {card.image_front_url ? (
                <img src={cdnImg(card.image_front_url)} alt="" className="w-9 h-12 object-cover rounded-lg shrink-0" />
              ) : (
                <div className="w-9 h-12 rounded-lg shrink-0 flex items-center justify-center text-sm" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{card.player ?? '—'}</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{[card.team, card.year].filter(Boolean).join(' · ')}</p>
              </div>
              {card.price != null && (
                <span className="text-sm font-black shrink-0" style={{ color: 'var(--accent)' }}>{card.price} €</span>
              )}
              <ExternalLink size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
