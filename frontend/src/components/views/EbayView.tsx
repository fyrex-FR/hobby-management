import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  ImageOff,
  ImagePlus,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import {
  useEbayAccountStatus,
  useEbayApplyImageToListings,
  useEbayConnect,
  useEbayDisconnect,
  useEbayLocationCreate,
  useEbaySellerImage,
  useEbaySellerImageSave,
  useEbaySellerSetup,
  useEbayShippingRules,
  useEbayShippingRulesSave,
  useEbaySyncSold,
} from '../../hooks/useEbayAccount';
import type { EbayApplyImageError, EbayPolicyOption, EbayShippingRule } from '../../hooks/useEbayAccount';
import { EbayLogo } from '../shared/EbayLogo';
import { cdnImg } from '../../lib/cdn';
import { downloadImage } from '../../lib/downloadImage';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/storage';
import { EbayPublishModal } from '../shared/EbayPublishModal';
import { EbayEditModal } from '../shared/EbayEditModal';
import { EbayStockSyncModal } from '../shared/EbayStockSyncModal';
import { EbaySaleReconcileModal } from '../shared/EbaySaleReconcileModal';
import { pendingReconcileCount } from '../../lib/saleReconcile';
import type { Card } from '../../types';
import { Badge, EmptyState, Field, Notice, Page, PageHeader, Panel, Spinner } from '../ui';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function SetupStep({
  title,
  detail,
  done,
  icon: Icon,
}: {
  title: string;
  detail: string;
  done?: boolean;
  icon: LucideIcon;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-card)] text-[var(--text-muted)]">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
          {done ? (
            <Badge tone="green"><CheckCircle2 size={11} /> OK</Badge>
          ) : (
            <Badge tone="accent"><AlertCircle size={11} /> À faire</Badge>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{detail}</p>
      </div>
    </div>
  );
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Barre de progression fine (lots eBay). */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
      <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

const APPLY_IMAGE_BATCH = 20;

function PricingRatesCard() {
  return (
    <Panel title="Calcul du prix eBay" icon={Calculator}>
      <p className="text-[13px] text-[var(--text-muted)]">
        Prix Vinted majoré pour couvrir 9 % de frais eBay et 0,35 € de frais fixes, puis arrondi au-dessus.
      </p>
    </Panel>
  );
}

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
    <Panel
      title="Image d’annonce"
      icon={ImagePlus}
      action={!isLoading && (imageUrl ? <Badge tone="green">Active</Badge> : <Badge>Aucune</Badge>)}
    >
      <div className="space-y-4">
        {isLoading ? (
          <Spinner className="py-4" />
        ) : imageUrl ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <img
                src={cdnImg(imageUrl)}
                alt="Image vendeur"
                className="max-h-40 w-auto self-start rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] object-contain"
              />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-[13px] text-[var(--text-muted)]">Ajoutée automatiquement en 3e photo de chaque annonce publiée.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => inputRef.current?.click()} disabled={busy} className="ui-btn ui-btn-sm">
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    Remplacer
                  </button>
                  <button onClick={handleDownload} disabled={busy || downloading} className="ui-btn ui-btn-sm">
                    {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Télécharger
                  </button>
                  <button onClick={handleCopyLink} disabled={busy} className={`ui-btn ui-btn-ghost ui-btn-sm ${copied ? 'text-[var(--green)]' : ''}`}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copié' : 'Copier le lien'}
                  </button>
                  <button onClick={remove} disabled={busy} className="ui-btn ui-btn-ghost ui-btn-danger ui-btn-sm">
                    <Trash2 size={14} />
                    Retirer
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Annonces déjà en ligne</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Uploade l’image dans le système photo eBay puis l’ajoute à chacune de tes annonces actives déjà en ligne. Opération sans risque à relancer : les annonces déjà mises à jour sont détectées et ignorées automatiquement.
                  </p>
                </div>
                <button onClick={handleApplyToListings} disabled={applying || busy} className="ui-btn shrink-0">
                  {applying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                  {applying
                    ? applyProgress
                      ? `Traitement… ${applyProgress.done}/${applyProgress.total} annonces`
                      : 'Traitement…'
                    : 'Ajouter à mes annonces existantes'}
                </button>
              </div>
              {applying && applyProgress && <ProgressBar done={applyProgress.done} total={applyProgress.total} />}
              {applyError && <Notice tone="error" icon={AlertCircle}>{applyError}</Notice>}
              {applySummary && (
                <div className="space-y-2">
                  <Notice tone={applySummary.errors.length > 0 ? 'warning' : 'success'} icon={CheckCircle2}>
                    {applySummary.updated} mise{applySummary.updated > 1 ? 's' : ''} à jour · {applySummary.skipped} avaient déjà l’image
                    {applySummary.errors.length > 0 ? ` · ${applySummary.errors.length} échec${applySummary.errors.length > 1 ? 's' : ''}` : ''}
                  </Notice>
                  {applySummary.errors.length > 0 && (
                    <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border)] px-3 py-2">
                      {applySummary.errors.map((err, i) => (
                        <li key={`${err.item_id}-${i}`} className="text-xs text-[var(--red)]">
                          {(err.title || err.item_id)} — {err.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <p className="text-xs text-[var(--text-muted)]">
                Pour tes annonces créées directement sur eBay : télécharge l’image puis ajoute-la via l’éditeur photo eBay (eBay n’accepte pas les liens externes dans une annonce existante), ou utilise le bouton ci-dessus qui le fait automatiquement.
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-[var(--text-muted)]">
              Ajoutée automatiquement en 3e photo de chaque annonce publiée — présente tes conditions d’envoi, ta protection des cartes, etc.
            </p>
            <button onClick={() => inputRef.current?.click()} disabled={busy} className="ui-btn ui-btn-primary shrink-0">
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              {uploading ? 'Envoi…' : 'Ajouter une image'}
            </button>
          </div>
        )}

        {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>
    </Panel>
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

  const preview = [...current]
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
      return { key: r.key, label, name: policyName(r.policyId) };
    });

  return (
    <Panel
      title="Règles de livraison"
      icon={Truck}
      action={configuredCount > 0 ? <Badge tone="green">{configuredCount} tranche{configuredCount > 1 ? 's' : ''}</Badge> : <Badge>Aucune</Badge>}
    >
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">Le bon mode d’envoi pré-sélectionné selon le prix, à la publication.</p>
      {fulfillmentOptions.length === 0 ? (
        <Notice tone="warning" icon={AlertTriangle}>
          Configure d’abord tes politiques d’expédition sur eBay (une par mode : lettre suivie, colis R1, R2…) pour pouvoir les associer à des tranches de prix ici.
        </Notice>
      ) : isLoading || rows === null ? (
        <Spinner className="py-4" />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Chaque tranche s’applique aux prix <span className="font-medium text-[var(--text-secondary)]">jusqu’à</span> son seuil inclus. Laisse le montant vide pour la tranche « et au-delà ». Au moment de publier, la politique d’expédition est choisie automatiquement d’après le prix (toujours modifiable).
          </p>

          <div className="space-y-2">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2.25rem] gap-2 text-xs font-medium text-[var(--text-secondary)] sm:grid">
              <span>Prix jusqu’à</span>
              <span>Mode d’envoi</span>
              <span />
            </div>
            {current.map((row) => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2.25rem] items-center gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">≤</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={row.maxPrice}
                    onChange={(e) => update(row.key, { maxPrice: e.target.value })}
                    placeholder="au-delà"
                    aria-label="Seuil de prix"
                    className="ui-input tabular pl-7 pr-7"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">€</span>
                </div>
                <select
                  value={row.policyId}
                  onChange={(e) => update(row.key, { policyId: e.target.value })}
                  aria-label="Politique d’expédition"
                  className="ui-select"
                >
                  <option value="">Choisir un envoi…</option>
                  {fulfillmentOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeRow(row.key)}
                  className="ui-btn ui-btn-ghost ui-btn-danger ui-btn-icon"
                  aria-label="Supprimer la tranche"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {current.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
              <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">Aperçu</p>
              {preview.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">—</p>
              ) : (
                <ul className="space-y-1">
                  {preview.map((r) => (
                    <li key={r.key} className="flex items-center gap-2 text-xs">
                      <span className="tabular w-24 shrink-0 text-[var(--text-primary)]">{r.label}</span>
                      <span className="text-[var(--text-muted)]">→</span>
                      <span className="truncate text-[var(--text-secondary)]">{r.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={addRow} className="ui-btn ui-btn-ghost ui-btn-sm">
              <Plus size={14} /> Ajouter une tranche
            </button>
            <button onClick={save} disabled={saveRules.isPending} className="ui-btn ui-btn-primary">
              {saveRules.isPending ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
              {saveRules.isPending ? 'Enregistrement…' : saved ? 'Enregistré' : 'Enregistrer les règles'}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

type ListingSegment = 'online' | 'sold' | 'ready';

function ListingRow({ card, right }: { card: Card; right: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-elevated)]">
      {card.image_front_url ? (
        <img src={cdnImg(card.image_front_url)} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <ImageOff size={14} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{card.player ?? '—'}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">{[card.team, card.year].filter(Boolean).join(' · ')}</p>
      </div>
      {right}
    </div>
  );
}

function ListingsTab({
  listed,
  sold,
  ready,
  allCards,
  connected,
  onGoSettings,
}: {
  listed: Card[];
  sold: Card[];
  ready: Card[];
  /** Toutes les cartes : la réconciliation se calcule sur l'ensemble, pas
   * seulement sur les segments affichés. */
  allCards: Card[];
  connected: boolean;
  onGoSettings: () => void;
}) {
  const [segment, setSegment] = useState<ListingSegment>('online');
  const [publishCard, setPublishCard] = useState<Card | null>(null);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const syncSold = useEbaySyncSold();
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Ventes à finaliser : une annonce est encore en ligne sur l'autre
  // plateforme alors que la carte est vendue (risque de double vente).
  const pendingReconcile = useMemo(
    () => pendingReconcileCount(allCards),
    [allCards],
  );

  async function handleSync() {
    setSyncMsg('');
    try {
      const res = await syncSold.mutateAsync();
      if ('connected' in res) {
        setSyncMsg('Connecte d’abord ton compte eBay.');
        return;
      }
      // Le sync vient de passer des cartes en vendu : leurs annonces Vinted
      // peuvent être encore en ligne. On invite à finaliser plutôt que de
      // fermer quoi que ce soit tout seul.
      if (res.synced > 0) setReconcileOpen(true);
      setSyncMsg(
        res.synced > 0
          ? `${res.synced} vente${res.synced > 1 ? 's' : ''} synchronisée${res.synced > 1 ? 's' : ''} ✓`
          : 'Aucune nouvelle vente détectée.',
      );
    } catch (e) {
      setSyncMsg((e as Error).message || 'Synchronisation impossible.');
    }
  }

  if (!connected) {
    return (
      <div className="ui-card">
        <EmptyState
          icon={Link2}
          title="Compte eBay non connecté"
          description="Connecte ton compte eBay pour voir et gérer tes annonces ici."
          action={<button onClick={onGoSettings} className="ui-btn ui-btn-primary">Aller dans Réglages</button>}
        />
      </div>
    );
  }

  const segments: { value: ListingSegment; label: string; count: number; icon: typeof ShoppingBag }[] = [
    { value: 'online', label: 'En ligne', count: listed.length, icon: ShoppingBag },
    { value: 'sold', label: 'Vendues', count: sold.length, icon: CheckCircle2 },
    { value: 'ready', label: 'Prêtes', count: ready.length, icon: Tag },
  ];
  const rows = segment === 'online' ? listed : segment === 'sold' ? sold : ready;
  const emptyText = {
    online: 'Aucune carte en ligne sur eBay pour le moment.',
    sold: 'Aucune vente eBay enregistrée. Le suivi automatique du statut « vendu » arrive bientôt.',
    ready: 'Aucune carte prête à publier (photo recto + prix requis).',
  }[segment];

  return (
    <div className="space-y-4">
      {pendingReconcile > 0 && (
        <Notice tone="warning" icon={AlertTriangle}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {pendingReconcile} vente{pendingReconcile > 1 ? 's' : ''} à finaliser : des annonces sont encore en ligne alors que la carte est vendue.
            </span>
            <button
              onClick={() => setReconcileOpen(true)}
              title="Des annonces sont encore en ligne alors que la carte est vendue"
              className="ui-btn ui-btn-sm"
            >
              Finaliser
            </button>
          </div>
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="ui-segmented max-w-full overflow-x-auto no-scrollbar" role="tablist">
          {segments.map((sg) => (
            <button key={sg.value} role="tab" aria-selected={segment === sg.value} data-active={segment === sg.value} onClick={() => setSegment(sg.value)}>
              <sg.icon size={14} />
              {sg.label}
              <span className="count">{sg.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStockModalOpen(true)}
            disabled={syncSold.isPending}
            title="Pousse le stock de l'app sur tes annonces eBay (utile pour les annonces publiées avant la gestion du stock, restées à 1)"
            className="ui-btn"
          >
            <PackageCheck size={15} />
            Pousser les stocks
          </button>
          <button
            onClick={handleSync}
            disabled={syncSold.isPending}
            title="Récupère tes ventes eBay et met les cartes vendues à jour"
            className="ui-btn"
          >
            {syncSold.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            {syncSold.isPending ? 'Synchronisation…' : 'Synchroniser'}
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        {syncMsg || 'Synchronise pour remonter tes ventes eBay ici.'}
      </p>

      <Panel padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon={segments.find((sg) => sg.value === segment)?.icon} title={emptyText} />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {rows.map((card) => {
              if (segment === 'online') {
                const price = card.ebay_price ?? card.price;
                return (
                  <ListingRow
                    key={card.id}
                    card={card}
                    right={
                      <div className="flex shrink-0 items-center gap-1.5">
                        {(card.quantity ?? 1) > 1 && (
                          <span title={`${card.quantity} exemplaires en ligne`}><Badge tone="blue">×{card.quantity}</Badge></span>
                        )}
                        {price != null && <span className="tabular mx-1 text-sm font-semibold text-[var(--accent)]">{euro.format(price)}</span>}
                        <button onClick={() => setEditCard(card)} className="ui-btn ui-btn-ghost ui-btn-sm" title="Modifier l’annonce">
                          <Pencil size={13} /> <span className="hidden sm:inline">Modifier</span>
                        </button>
                        <a href={card.ebay_url!} target="_blank" rel="noreferrer" className="ui-btn ui-btn-ghost ui-btn-sm" title="Voir sur eBay">
                          <ExternalLink size={13} /> <span className="hidden sm:inline">Voir</span>
                        </a>
                      </div>
                    }
                  />
                );
              }
              if (segment === 'sold') {
                const soldPrice = card.ebay_sold_price ?? card.ebay_price ?? card.price;
                return (
                  <ListingRow
                    key={card.id}
                    card={card}
                    right={
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {soldPrice != null && <span className="tabular text-sm font-semibold text-[var(--green)]">{euro.format(soldPrice)}</span>}
                        {card.ebay_sold_at && (
                          <span className="tabular text-[11px] text-[var(--text-muted)]">
                            {new Date(card.ebay_sold_at).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    }
                  />
                );
              }
              const price = card.ebay_price ?? card.price;
              return (
                <ListingRow
                  key={card.id}
                  card={card}
                  right={
                    <div className="flex shrink-0 items-center gap-2">
                      {price != null && <span className="tabular text-sm font-semibold text-[var(--accent)]">{euro.format(price)}</span>}
                      <button onClick={() => setPublishCard(card)} className="ui-btn ui-btn-primary ui-btn-sm">
                        <EbayLogo width={24} height={10} mono="#09090B" /> Publier
                      </button>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </Panel>

      {publishCard && (
        <EbayPublishModal
          card={publishCard}
          onClose={() => setPublishCard(null)}
          onPublished={() => setPublishCard(null)}
        />
      )}

      {editCard && (
        <EbayEditModal card={editCard} onClose={() => setEditCard(null)} />
      )}

      {stockModalOpen && (
        <EbayStockSyncModal onClose={() => setStockModalOpen(false)} />
      )}

      {reconcileOpen && (
        <EbaySaleReconcileModal cards={allCards} onClose={() => setReconcileOpen(false)} />
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

  const [tab, setTab] = useState<'annonces' | 'reglages'>('annonces');
  const listed = useMemo(() => cards.filter((c) => c.ebay_url && c.status !== 'vendu'), [cards]);
  const sold = useMemo(
    () => cards.filter((c) => c.status === 'vendu' && (c.ebay_url || c.ebay_listing_id)),
    [cards],
  );
  const readyNotListed = useMemo(
    () => cards.filter((c) => c.status === 'a_vendre' && !c.ebay_url && c.image_front_url && (c.ebay_price ?? c.price ?? 0) > 0),
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

  const connected = Boolean(status?.connected);
  const missingPolicyNames = policies && !policies.configured
    ? [!policies.payment && 'paiement', !policies.fulfillment && 'livraison', !policies.return && 'retours'].filter(Boolean).join(', ')
    : '';
  const stepsDone = [connected, hasLocation, hasPolicies, readyNotListed.length > 0 || listed.length > 0].filter(Boolean).length;

  return (
    <Page width="narrow">
      <PageHeader
        title={<span className="flex items-center gap-2.5"><EbayLogo width={52} height={20} /><span className="sr-only">eBay</span></span>}
        subtitle="Tes annonces et tes réglages vendeur"
        actions={
          <div className="ui-segmented" role="tablist">
            {([
              { value: 'annonces', label: 'Annonces', icon: ShoppingBag },
              { value: 'reglages', label: 'Réglages', icon: Settings },
            ] as const).map((t) => (
              <button key={t.value} role="tab" aria-selected={tab === t.value} data-active={tab === t.value} onClick={() => setTab(t.value)}>
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {notice && (
        <Notice tone={notice.kind} icon={notice.kind === 'success' ? CheckCircle2 : AlertCircle}>
          {notice.text}
        </Notice>
      )}

      {tab === 'reglages' ? (
        <div className="space-y-4">
          {/* Statut de connexion */}
          <Panel
            title="Compte eBay"
            icon={Link2}
            action={!isLoading && (connected ? <Badge tone="green">Connecté</Badge> : <Badge tone="red">Non connecté</Badge>)}
          >
            {isLoading ? (
              <Spinner className="py-4" />
            ) : status?.connected ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--green)_12%,transparent)] text-[var(--green)]">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      Connecté{status.ebay_username ? ` en tant que ${status.ebay_username}` : ''}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Marketplace {status.marketplace_id || 'EBAY_FR'}
                      {status.connected_at ? ` · depuis le ${new Date(status.connected_at).toLocaleDateString('fr-FR')}` : ''}
                    </p>
                  </div>
                </div>
                <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="ui-btn ui-btn-danger shrink-0">
                  <LogOut size={15} />
                  {disconnect.isPending ? 'Déconnexion…' : 'Déconnecter'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Connecte ton compte eBay pour publier tes cartes directement depuis
                  CardVaults. Chaque utilisateur connecte son propre compte — tes
                  annonces sont publiées en ton nom.
                </p>
                {connect.error && <Notice tone="error" icon={AlertCircle}>{(connect.error as Error).message}</Notice>}
                <button onClick={() => connect.mutate()} disabled={connect.isPending} className="ui-btn ui-btn-primary">
                  {connect.isPending ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                  {connect.isPending ? 'Redirection…' : 'Connecter mon compte eBay'}
                </button>
              </div>
            )}
          </Panel>

          <Panel
            title="Avant de publier"
            icon={ClipboardList}
            action={<span className="tabular text-xs text-[var(--text-muted)]">{stepsDone} / 4</span>}
          >
            <div className="space-y-4">
              <p className="text-[13px] text-[var(--text-muted)]">
                Chaque vendeur configure son propre compte eBay. CardVaults utilise ensuite ces réglages pour créer l’annonce avec la bonne catégorie sport, l’état carte adapté, le lieu d’expédition et les options de vente eBay.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SetupStep
                  icon={Link2}
                  done={connected}
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
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5"><Truck size={13} className="text-[var(--text-muted)]" /> Expédition depuis le lieu vendeur</span>
                <span className="flex items-center gap-1.5"><Tag size={13} className="text-[var(--text-muted)]" /> Catégorie sport prioritaire</span>
                <span className="flex items-center gap-1.5"><FileText size={13} className="text-[var(--text-muted)]" /> Description générée puis éditable</span>
              </div>
              {status?.connected && policies && !policies.configured && (
                <Notice tone="error" icon={AlertCircle}>À configurer côté eBay : {missingPolicyNames}.</Notice>
              )}
            </div>
          </Panel>

          {status?.connected && (
            <Panel
              title="Lieu d’expédition"
              icon={MapPin}
              action={location ? <Badge tone="green">Enregistré</Badge> : <Badge tone="accent">Requis</Badge>}
            >
              <div className="space-y-3">
                <p className="truncate text-[13px] text-[var(--text-muted)]">
                  {location
                    ? `${location.name || location.merchantLocationKey} · ${location.location?.address?.postalCode || ''} ${location.location?.address?.city || ''}`
                    : 'Requis pour publier sur eBay'}
                </p>
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[140px_1fr_auto]">
                  <Field label="Code postal">
                    <input
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="75001"
                      inputMode="numeric"
                      className="ui-input tabular"
                    />
                  </Field>
                  <Field label="Ville">
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Paris"
                      className="ui-input"
                    />
                  </Field>
                  <button
                    onClick={saveLocation}
                    disabled={createLocation.isPending || !postalCode.trim() || !city.trim()}
                    className="ui-btn ui-btn-primary"
                  >
                    {createLocation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Enregistrer
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {status?.connected && (
            <ShippingRulesCard fulfillmentOptions={policies?.options?.fulfillment ?? []} />
          )}

          <SellerImageCard />

          <PricingRatesCard />
        </div>
      ) : (
        <ListingsTab
          allCards={cards}
          listed={listed}
          sold={sold}
          ready={readyNotListed}
          connected={Boolean(status?.connected)}
          onGoSettings={() => setTab('reglages')}
        />
      )}
    </Page>
  );
}
