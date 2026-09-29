import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, Clock, Loader2, RefreshCw, ScanSearch, TrendingDown, TrendingUp } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { cdnImg } from '../../lib/cdn';
import { Notice } from '../ui';
import { EbayLogo } from './EbayLogo';

interface EbayResult {
  title: string;
  price: number;
  currency: string;
  url: string;
  image: string;
  condition: string;
  end_date: string;
  sale_type: string;
  epid?: string;
  item_id?: string;
}

interface EbayData {
  count?: number;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  median?: number | null;
  results?: EbayResult[];
  error?: string;
  detail?: string;
  needs_approval?: boolean;
  source?: string;
  cached?: boolean;
  fetched_at?: string;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}


async function urlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Image inaccessible');
  const blob = await resp.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error('Conversion image impossible');
  return match[1];
}

interface MatchInfo {
  year?: string | null;
  cardNumber?: string | null;
  numbered?: string | null;
  setName?: string | null;
}

/** Vrai si `title` contient le nombre `n` isolé (pas 133 pour 33, pas 1490 pour 149). */
function titleHasNumber(title: string, n: string): boolean {
  const digits = n.replace(/[^0-9]/g, '');
  if (!digits) return false;
  return new RegExp(`(^|[^0-9])0*${digits}([^0-9]|$)`).test(title);
}

/** Match du n° de carte, en gérant les numéros alphanumériques (ex. « CHR-KK »). */
function titleHasCardNumber(title: string, num: string): boolean {
  const n = num.trim();
  if (!n) return true;
  if (/[a-zA-Z]/.test(n)) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return norm(title).includes(norm(n));
  }
  return titleHasNumber(title, n);
}

/** Ne garde que les ventes qui correspondent vraiment à la carte (n° + tirage + année). */
function filterRelevant(results: EbayResult[], m?: MatchInfo): EbayResult[] {
  if (!m) return results;
  const preds: Array<(t: string) => boolean> = [];

  const year4 = m.year ? (m.year.match(/\d{4}/)?.[0] ?? '') : '';
  if (year4) preds.push((t) => titleHasNumber(t, year4));
  if (m.cardNumber) preds.push((t) => titleHasCardNumber(t, m.cardNumber!));

  // Tirage /149 : discriminant fort de parallèle. Sinon, on retombe sur le set.
  const denom = m.numbered ? (m.numbered.match(/(\d+)\s*$/)?.[1] ?? '') : '';
  if (denom) {
    preds.push((t) => titleHasNumber(t, denom));
  } else if (m.setName) {
    const set = m.setName.toLowerCase();
    preds.push((t) => t.toLowerCase().includes(set));
  }

  if (!preds.length) return results;
  // Précision avant tout : si rien ne matche, on renvoie vide (le bouton
  // « Voir tout » permet de retrouver l'ensemble non filtré).
  return results.filter((r) => preds.every((p) => p(r.title)));
}

function computeStats(results: EbayResult[]) {
  const prices = results.map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (!prices.length) return null;
  const n = prices.length;
  const median = n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  return {
    count: n,
    min: Math.round(prices[0] * 100) / 100,
    max: Math.round(prices[n - 1] * 100) / 100,
    median: Math.round(median * 100) / 100,
  };
}

// Prix de vente proposé à partir des ventes eBay. Pas de conversion $→€
// (1 $ = 1 €), juste un arrondi à l'euro pour un prix propre.
function toEurPrice(usd: number): number {
  return Math.max(1, Math.round(usd));
}

interface Props {
  query: string;
  /** URL de la photo recto — active la recherche visuelle eBay. */
  imageUrl?: string | null;
  /** Attributs de la carte pour filtrer les ventes non pertinentes. */
  match?: MatchInfo;
  /** Prix de vente actuel de la carte (€). */
  currentPrice?: number | null;
  /** Applique un prix de vente (€) à la carte. */
  onApplyPrice?: (eur: number) => void | Promise<unknown>;
  /** Id de la carte — active le cache des ventes côté serveur. */
  cardId?: string;
  /** Lance la recherche dès l'affichage, utile dans les parcours en chaîne. */
  autoFetch?: boolean;
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function formatEuro(v: number): string {
  return euro.format(v);
}

/** Petite pastille d'information (état, type de vente). */
function MetaTag({ children, color = 'var(--text-secondary)' }: { children: ReactNode; color?: string }) {
  const neutral = color === 'var(--text-secondary)';
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium"
      style={{ color, background: neutral ? 'var(--bg-elevated)' : `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </span>
  );
}

/** Mini-graphe SVG de la tendance des ventes (prix dans le temps) + %. */
function SalesTrend({ sales }: { sales: EbayResult[] }) {
  const pts = sales
    .map((s) => ({ t: new Date(s.end_date).getTime(), p: s.price }))
    .filter((d) => Number.isFinite(d.t) && d.p > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 3) return null;

  const t0 = pts[0].t;
  const xs = pts.map((d) => (d.t - t0) / 86400000); // jours
  const ys = pts.map((d) => d.p);
  const n = pts.length;
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const denom = n * sxx - sx * sx;
  const a = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const b = (sy - a * sx) / n;
  const xMax = xs[n - 1] || 1;
  const startP = b;
  const endP = a * xMax + b;
  const trendPct = startP > 0 ? ((endP - startP) / startP) * 100 : 0;
  const up = trendPct >= 0;
  const color = up ? 'var(--green)' : 'var(--red)';

  const W = 320, H = 120;
  const padL = 30, padR = 8, padT = 12, padB = 18;
  const pMin = Math.min(...ys), pMax = Math.max(...ys);
  const pRange = pMax - pMin || 1;
  const median = [...ys].sort((a, b) => a - b)[Math.floor(n / 2)];
  const cx = (x: number) => padL + (x / (xMax || 1)) * (W - padL - padR);
  const cy = (p: number) => padT + (1 - (p - pMin) / pRange) * (H - padT - padB);
  const yClamp = (p: number) => Math.max(padT, Math.min(H - padB, cy(p)));

  const firstDate = new Date(pts[0].t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const lastDate = new Date(pts[n - 1].t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const TrendIcon = up ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Tendance <span className="tabular text-[var(--text-muted)]">· {n} ventes</span>
        </span>
        <span className="tabular inline-flex items-center gap-1 text-xs font-semibold" style={{ color }}>
          <TrendIcon size={13} />
          {up ? '+' : ''}{trendPct.toFixed(0)} %
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {/* Grille médiane */}
        <line x1={padL} y1={cy(median)} x2={W - padR} y2={cy(median)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
        {/* Labels prix */}
        <text x={2} y={padT + 4} fontSize={10} fill="var(--text-muted)">${pMax}</text>
        <text x={2} y={H - padB} fontSize={10} fill="var(--text-muted)">${pMin}</text>
        {/* Dates */}
        <text x={padL} y={H - 3} fontSize={10} fill="var(--text-muted)">{firstDate}</text>
        <text x={W - padR} y={H - 3} fontSize={10} fill="var(--text-muted)" textAnchor="end">{lastDate}</text>
        {/* Ligne de tendance */}
        <line x1={cx(0)} y1={yClamp(startP)} x2={cx(xMax)} y2={yClamp(endP)} stroke={color} strokeWidth={2} strokeLinecap="round" />
        {/* Points */}
        {pts.map((d, i) => (
          <circle key={i} cx={cx(xs[i])} cy={cy(d.p)} r={3} fill="var(--accent)" opacity={0.9} />
        ))}
      </svg>
    </div>
  );
}

export function EbaySoldItems({ query, imageUrl, match, currentPrice, onApplyPrice, cardId, autoFetch = false }: Props) {
  const [effectiveQuery, setEffectiveQuery] = useState(query);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [appliedPrice, setAppliedPrice] = useState<number | null>(null);
  const [customPrice, setCustomPrice] = useState('');

  // Recherche visuelle
  const [visual, setVisual] = useState<EbayData | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);

  // Prix (onglets)
  const [tab, setTab] = useState<'sold' | 'active'>('sold');
  const [sold, setSold] = useState<EbayData | null>(null);
  const [active, setActive] = useState<EbayData | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  async function fetchVisual() {
    if (!imageUrl) return;
    setVisualLoading(true);
    try {
      const image_base64 = await urlToBase64(cdnImg(imageUrl) || imageUrl);
      const result = await apiFetch<EbayData>('/ebay/visual-match', {
        method: 'POST',
        body: JSON.stringify({ image_base64 }),
      });
      setVisual(result);
    } catch (e) {
      setVisual({ error: (e as Error).message });
    } finally {
      setVisualLoading(false);
    }
  }

  const fetchPrices = useCallback(async (q: string, refresh = false) => {
    setPriceLoading(true);
    setSold(null);
    setActive(null);
    try {
      const [soldRes, activeRes] = await Promise.all([
        apiFetch<EbayData>('/ebay/sold-items', {
          method: 'POST',
          body: JSON.stringify({ query: q, card_id: cardId, refresh }),
        }),
        apiFetch<EbayData>('/ebay/active-items', {
          method: 'POST',
          body: JSON.stringify({ query: q }),
        }),
      ]);
      setSold(soldRes);
      setActive(activeRes);
    } catch (e) {
      const err = { error: (e as Error).message };
      setSold(err);
      setActive(err);
    } finally {
      setPriceLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    if (autoFetch) void fetchPrices(query);
  }, [autoFetch, fetchPrices, query]);

  function selectVisual(r: EbayResult) {
    setSelectedTitle(r.title);
    setEffectiveQuery(r.title);
    fetchPrices(r.title);
  }

  const current = tab === 'sold' ? sold : active;
  const hasPrices = sold != null || active != null;

  // Filtrage de pertinence (n° + tirage + année) + stats recalculées dessus.
  // Si l'utilisateur a choisi une correspondance visuelle, on ne re-filtre pas
  // (il a déjà validé la carte à l'œil ; les attributs IA peuvent être faux).
  const effectiveMatch = selectedTitle ? undefined : match;
  const soldShown = sold?.results ? (showAll ? sold.results : filterRelevant(sold.results, effectiveMatch)) : [];
  const activeShown = active?.results ? (showAll ? active.results : filterRelevant(active.results, effectiveMatch)) : [];
  const soldStats = computeStats(soldShown);
  const activeStats = computeStats(activeShown);
  const currentShown = tab === 'sold' ? soldShown : activeShown;
  const currentRawCount = current?.results?.length ?? 0;
  const filteredOut = !showAll && currentRawCount > currentShown.length;


  return (
    <div className="flex flex-col gap-3">
      {/* --- Déclencheurs : prix (recherche texte) + recherche visuelle --- */}
      {(!hasPrices || (imageUrl && !selectedTitle)) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {!hasPrices && (
            <button onClick={() => fetchPrices(effectiveQuery)} disabled={priceLoading} className="ui-btn flex-1">
              {priceLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Recherche eBay…
                </>
              ) : (
                <>
                  <EbayLogo /> Voir les ventes
                </>
              )}
            </button>
          )}
          {imageUrl && !selectedTitle && (
            <button onClick={fetchVisual} disabled={visualLoading} className="ui-btn flex-1">
              {visualLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Identification visuelle…
                </>
              ) : (
                <>
                  <ScanSearch size={15} /> Correspondances visuelles
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* --- Résultats de la recherche visuelle --- */}
      {visual && !selectedTitle && (
        <div className="rounded-xl border border-[var(--border)] p-3">
          {visual.error ? (
            <Notice tone="error">{visual.error}</Notice>
          ) : !visual.results?.length ? (
            <p className="text-[13px] text-[var(--text-muted)]">Aucune correspondance visuelle.</p>
          ) : (
            <>
              <p className="mb-2.5 text-xs text-[var(--text-muted)]">Sélectionne la carte qui correspond pour voir ses prix.</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {visual.results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => selectVisual(r)}
                    className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
                  >
                    {r.image && <img src={r.image} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover" />}
                    <div className="flex flex-1 flex-col gap-0.5 p-1.5">
                      <p className="line-clamp-2 text-[11px] leading-tight text-[var(--text-muted)]">{r.title}</p>
                      <p className="tabular mt-auto text-xs font-semibold text-[var(--price)]">${r.price}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* --- Panneau prix --- */}
      {hasPrices && (
        <div className="flex flex-col gap-3">
          {selectedTitle && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-elevated)] py-1.5 pl-3 pr-1.5">
              <Check size={14} className="shrink-0 text-[var(--green)]" />
              <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]" title={selectedTitle}>
                {selectedTitle}
              </p>
              <button
                onClick={() => { setSelectedTitle(null); setEffectiveQuery(query); setSold(null); setActive(null); }}
                className="ui-btn ui-btn-ghost ui-btn-sm shrink-0"
              >
                Changer
              </button>
            </div>
          )}

          {/* Médiane / min / max (onglet Vendues prioritaire), sur données filtrées */}
          {(() => {
            const usingSold = soldStats != null;
            const stats = usingSold ? soldStats : activeStats;
            if (!stats) return null;
            // Libellé honnête : « ventes » seulement quand la donnée vient du vendu.
            const statsLabel = usingSold ? 'Médiane des ventes' : 'Médiane des annonces en cours';
            return (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-xl border border-[var(--border)] px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--text-muted)]">{statsLabel}</div>
                    <div className="tabular text-2xl font-semibold tracking-tight text-[var(--accent)]">${stats.median}</div>
                  </div>
                  <dl className="flex gap-5 text-right">
                    <div>
                      <dt className="text-[11px] text-[var(--text-muted)]">Min</dt>
                      <dd className="tabular text-sm font-semibold text-[var(--text-primary)]">${stats.min}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-muted)]">Max</dt>
                      <dd className="tabular text-sm font-semibold text-[var(--text-primary)]">${stats.max}</dd>
                    </div>
                  </dl>
                </div>

                {/* Définir le prix de vente à partir de la médiane */}
                {usingSold && onApplyPrice && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Définir le prix de vente</span>
                      {(appliedPrice ?? currentPrice) != null && (
                        <span
                          className="tabular inline-flex items-center gap-1 text-xs"
                          style={{ color: appliedPrice != null ? 'var(--green)' : 'var(--text-muted)' }}
                        >
                          {appliedPrice != null ? <Check size={12} /> : 'Actuel : '}
                          {formatEuro((appliedPrice ?? currentPrice) as number)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Médiane', mult: 1 },
                        { label: '+15%', mult: 1.15 },
                        { label: '+20%', mult: 1.2 },
                      ].map(({ label, mult }) => {
                        const eur = toEurPrice(stats.median * mult);
                        return (
                          <button
                            key={label}
                            onClick={async () => { if (!onApplyPrice) return; setAppliedPrice(eur); await onApplyPrice(eur); }}
                            data-active={appliedPrice === eur}
                            className="ui-btn h-auto flex-col gap-0 py-1.5"
                          >
                            <span className="text-[11px] font-medium text-[var(--text-muted)]">{label}</span>
                            <span className="tabular text-[13px] font-semibold text-[var(--price)]">{formatEuro(eur)}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Prix libre */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="Autre prix (€)"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        className="ui-input tabular flex-1"
                      />
                      <button
                        disabled={!customPrice || !(Number(customPrice) > 0)}
                        onClick={async () => {
                          if (!onApplyPrice) return;
                          const v = Math.round(Number(customPrice));
                          if (!(v > 0)) return;
                          setAppliedPrice(v);
                          setCustomPrice('');
                          await onApplyPrice(v);
                        }}
                        className="ui-btn ui-btn-primary"
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Onglets */}
          <div className="ui-segmented w-full">
            {(['sold', 'active'] as const).map((t) => {
              const d = t === 'sold' ? sold : active;
              const shownCount = t === 'sold' ? soldShown.length : activeShown.length;
              const label = t === 'sold' ? 'Vendues' : 'En vente';
              const n = d?.results ? shownCount : d?.count;
              return (
                <button key={t} onClick={() => setTab(t)} data-active={tab === t} className="flex-1 justify-center">
                  {label}
                  {n != null && <span className="count">{n}</span>}
                </button>
              );
            })}
          </div>

          {/* Filtre pertinence : info + bascule */}
          {(filteredOut || showAll) && currentRawCount > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="tabular text-xs text-[var(--text-muted)]">
                {showAll
                  ? `Tout affiché (${currentRawCount})`
                  : `${currentShown.length} pertinentes sur ${currentRawCount}`}
              </span>
              <button onClick={() => setShowAll((v) => !v)} className="ui-btn ui-btn-ghost ui-btn-sm text-[var(--accent)]">
                {showAll ? 'Filtrer' : 'Voir tout'}
              </button>
            </div>
          )}

          {/* Contenu onglet */}
          {current?.needs_approval ? (
            <Notice tone="info" icon={Clock}>
              Les ventes réelles arrivent via l'API eBay Marketplace Insights, en attente d'approbation de
              l'application par eBay. En attendant, l'onglet « En vente » affiche les annonces en cours.
            </Notice>
          ) : current?.error ? (
            <Notice tone="error">
              <p>{current.error}</p>
              {current.detail && <p className="mt-1 text-xs text-[var(--text-muted)]">{current.detail}</p>}
            </Notice>
          ) : currentShown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-6 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">
                {filteredOut
                  ? 'Aucune vente correspondant exactement à cette carte. Essaie « Voir tout ».'
                  : 'Aucun résultat sur eBay.'}
              </p>
              {current?.detail && <p className="mt-1 text-xs text-[var(--text-muted)]">{current.detail}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tab === 'sold' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-muted)]">
                    {[sold?.cached ? 'Depuis le cache' : null, current?.source === 'scrape' ? 'Ventes réelles issues des annonces terminées eBay' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <button
                    onClick={() => fetchPrices(effectiveQuery, true)}
                    disabled={priceLoading}
                    className="ui-btn ui-btn-ghost ui-btn-sm shrink-0"
                  >
                    <RefreshCw size={13} className={priceLoading ? 'animate-spin' : ''} /> Actualiser
                  </button>
                </div>
              )}
              {tab === 'sold' && <SalesTrend sales={soldShown} />}
              <div className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
                {currentShown.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--bg-elevated)]"
                  >
                    {r.image ? (
                      <img src={r.image} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-14 w-10 shrink-0 rounded-md bg-[var(--bg-elevated)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] leading-snug text-[var(--text-secondary)]">{r.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {r.condition && <MetaTag>{r.condition}</MetaTag>}
                        {r.sale_type && (
                          <MetaTag color={r.sale_type === 'Enchère' ? 'var(--blue)' : r.sale_type === 'Vendu' ? 'var(--green)' : 'var(--accent)'}>
                            {r.sale_type}
                          </MetaTag>
                        )}
                        {r.end_date && <span className="tabular text-[11px] text-[var(--text-muted)]">{formatDate(r.end_date)}</span>}
                      </div>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold text-[var(--text-primary)]">${r.price}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
