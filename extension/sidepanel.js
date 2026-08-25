const API = "https://collection-api.cardvaults.app/api/extension";
const state = {
  listing: null, analysis: null, excluded: new Set(), pairing: null,
  run: 0, timer: null, resultTab: "sold", override: null, open: new Set(),
};

const $ = (id) => document.getElementById(id);
const show = (id, visible = true) => $(id).classList.toggle("hidden", !visible);
const escapeHtml = (value) => { const d = document.createElement("div"); d.textContent = value || ""; return d.innerHTML; };
const escapeAttr = (value) => String(value || "").replace(/[&"'<>]/g, (char) => ({ "&": "&amp;", '"': "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;" }[char]));
const currency = (value, code = "EUR") => value == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: code || "EUR" }).format(Number(value));
const slug = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function storageGet(key) { return (await chrome.storage.local.get(key))[key]; }
async function api(path, options = {}, authenticated = true) {
  const token = await storageGet("scout_token");
  const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `Erreur ${response.status}`);
  return response.status === 204 ? null : response.json();
}

/* ---------- Carte de référence : ce à quoi on compare ---------- */

const GRADERS = ["PSA", "BGS", "CGC", "SGC", "CCC", "ACE", "PCA", "GMA", "HGA", "TAG", "ISA"];
const GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4", "3", "2", "1"];
const LABELS = ["Gold", "Black", "Silver", "Pristine", "Perfect"];

// Mêmes clés que `services/card_taxonomy.py`, pour que la correction manuelle
// retombe exactement sur les cases calculées côté backend.
function gradeKey(grader, grade, label) {
  if (!grader && !grade && !label) return "raw";
  return [slug(grader || "gradee"), grade ? String(grade).replace(".", "-") : null, label ? slug(label) : null].filter(Boolean).join("-");
}
function gradeText(grader, grade, label) {
  if (!grader && !grade && !label) return "Brut";
  return [grader || "Gradée", grade || null, label ? `${label} Label` : null].filter(Boolean).join(" ");
}

// Repli si le backend déployé est antérieur au classement : tout retombe dans
// une case unique au lieu de casser le panneau.
const UNCLASSIFIED = {
  variant_key: "base", variant_text: "Base", grade_key: "raw", grade_text: "Brut",
  bucket_key: "base|raw", bucket_text: "Base · Brut", graded: false, serial: null, card_number: "",
};

/** Référence courante : celle détectée, écrasée par la correction manuelle. */
function reference() {
  return { ...UNCLASSIFIED, ...(state.analysis?.reference || {}), ...(state.override || {}) };
}

/** Toutes les variantes rencontrées dans les résultats, pour le sélecteur. */
function knownVariants() {
  const found = new Map();
  const base = state.analysis?.reference;
  if (base) found.set(base.variant_key, base.variant_text);
  for (const tab of ["sold", "active"]) {
    for (const item of state.analysis?.[tab]?.results || []) {
      if (item.match === "off_card" || !item.classification) continue;
      found.set(item.classification.variant_key, item.classification.variant_text);
    }
  }
  if (!found.has("base")) found.set("base", "Base");
  return [...found.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
}

function renderReference() {
  const detected = state.analysis?.reference;
  if (!detected) { show("reference", false); return; }
  const options = (values, selected, empty = null) =>
    [...(empty ? [`<option value=""${selected ? "" : " selected"}>${empty}</option>`] : []), ...values.map((value) => {
      const [key, text] = Array.isArray(value) ? value : [value, value];
      return `<option value="${escapeAttr(key)}"${key === selected ? " selected" : ""}>${escapeHtml(text)}</option>`;
    })].join("");

  $("reference").innerHTML = `
    <div class="section-label">CARTE ANALYSÉE</div>
    <div class="chips" id="ref-chips"></div>
    <details class="tune"><summary>Corriger la variante ou la note</summary>
      <div class="tune-grid">
        <select id="ref-variant" title="Variante">${options(knownVariants(), detected.variant_key)}</select>
        <select id="ref-grader" title="Société de notation">${options(GRADERS, detected.grader || "", "Non gradée")}</select>
        <select id="ref-grade" title="Note">${options(GRADES, detected.grade != null ? String(detected.grade) : "", "— note —")}</select>
        <select id="ref-label" title="Label du slab">${options(LABELS, detected.grade_label || "", "— label —")}</select>
      </div>
    </details>`;
  $("reference").querySelectorAll("select").forEach((select) => select.addEventListener("change", applyOverride));
  syncChips();
  show("reference");
}

function applyOverride() {
  const variantKey = $("ref-variant").value || "base";
  const variantText = $("ref-variant").selectedOptions[0]?.textContent || "Base";
  const grader = $("ref-grader").value || null;
  const grade = $("ref-grade").value || null;
  const label = $("ref-label").value || null;
  state.override = {
    variant_key: variantKey, variant_text: variantText,
    grader, grade: grade ? Number(grade) : null, grade_label: label,
    graded: Boolean(grader || grade || label),
    grade_key: gradeKey(grader, grade, label), grade_text: gradeText(grader, grade, label),
    bucket_key: `${variantKey}|${gradeKey(grader, grade, label)}`,
  };
  state.excluded.clear();
  syncChips();
  renderResults();
}

function syncChips() {
  const ref = reference();
  const chips = [
    `<span class="chip variant">${escapeHtml(ref.variant_text || "Base")}</span>`,
    `<span class="chip grade${ref.graded ? " graded" : ""}">${escapeHtml(ref.grade_text || "Brut")}</span>`,
  ];
  if (ref.card_number) chips.push(`<span class="chip num">#${escapeHtml(ref.card_number)}</span>`);
  if (state.override) chips.push(`<span class="chip fixed">corrigé</span>`);
  $("ref-chips").innerHTML = chips.join("");
}

/* ---------- Regroupement des comparables ---------- */

const LEVEL_RANK = { exact: 0, variant: 1, grade: 2, other: 3, off_card: 4 };
const LEVEL_NOTE = {
  variant: "même variante, autre note",
  grade: "même note, autre variante",
  other: "autre variante et autre note",
  off_card: "lots, réimpressions et autres numéros",
};

/**
 * Situe un comparable par rapport à la référence courante. `off_card` vient du
 * backend (lot, réimpression, numéro différent) et ne bouge pas si l'on
 * corrige la note ; les autres niveaux se recalculent ici, sans réinterroger
 * eBay.
 */
function levelOf(item, ref) {
  if (item.match === "off_card") return "off_card";
  const found = item.classification || {};
  const sameVariant = found.variant_key === ref.variant_key;
  const sameGrade = found.grade_key === ref.grade_key;
  if (sameVariant && sameGrade) return "exact";
  if (sameVariant) return "variant";
  if (sameGrade) return "grade";
  return "other";
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function prices(items) {
  return items.map((item) => Number(item.price)).filter(Number.isFinite);
}

function itemsFor(tab) {
  return (state.analysis?.[tab]?.results || []).map((item, index) =>
    ({ ...item, index, classification: item.classification || UNCLASSIFIED }));
}

function groupItems(items, ref) {
  const groups = new Map();
  for (const item of items) {
    const level = levelOf(item, ref);
    const key = level === "off_card" ? "__off__" : item.classification.bucket_key;
    if (!groups.has(key)) {
      groups.set(key, {
        key, level,
        text: level === "off_card" ? "Hors carte" : item.classification.bucket_text,
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  // La case exacte reste visible même vide : « 0 vente » est une information.
  if (!groups.has(ref.bucket_key)) {
    groups.set(ref.bucket_key, { key: ref.bucket_key, level: "exact", text: `${ref.variant_text || "Base"} · ${ref.grade_text || "Brut"}`, items: [] });
  }
  return [...groups.values()].sort((a, b) =>
    LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.items.length - a.items.length || a.text.localeCompare(b.text, "fr"));
}

/**
 * Ventes servant de base au prix. La case exacte d'abord ; à défaut la même
 * variante, toutes notes confondues, et l'écran le dit. Écarter toutes les
 * ventes de la case n'élargit pas la base : c'est un choix de l'utilisateur.
 */
function estimateBasis(soldGroups) {
  const keep = (items) => items.filter((item) => !state.excluded.has(item.index));
  const exact = soldGroups.find((group) => group.level === "exact");
  const kept = keep(exact?.items || []);
  if (kept.length || exact?.items.length) return { items: kept, label: exact.text, exact: true };
  const variant = keep(soldGroups.filter((group) => group.level === "variant").flatMap((group) => group.items));
  if (variant.length) return { items: variant, label: `${reference().variant_text || "Base"}, toutes notes`, exact: false };
  return { items: [], label: exact?.text || "", exact: true };
}

const VERDICTS = [
  { max: -0.15, key: "good", text: "Bonne affaire" },
  { max: 0.10, key: "ok", text: "Prix correct" },
  { max: 0.35, key: "warn", text: "Un peu cher" },
  { max: Infinity, key: "bad", text: "Surpayé" },
];

function verdictFor(price, base) {
  if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return null;
  const gap = (price - base) / base;
  const verdict = VERDICTS.find((entry) => gap <= entry.max);
  const percent = Math.round(Math.abs(gap) * 100);
  return { ...verdict, text: percent < 3 ? "Au prix du marché" : verdict.text, gap: `${percent} % ${gap >= 0 ? "au-dessus du" : "sous le"} marché` };
}

/* ---------- Rendu ---------- */

function deltaHtml(item, base) {
  const price = Number(item.price);
  if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return "";
  const gap = price - base;
  if (Math.abs(gap) < 0.5) return `<span class="delta same">même prix</span>`;
  const sign = gap > 0 ? "up" : "down";
  return `<span class="delta ${sign}">${gap > 0 ? "+" : "−"}${currency(Math.abs(gap), item.currency)}</span>`;
}

function resultHtml(item, sold, base) {
  const found = item.classification || {};
  const excluded = sold && state.excluded.has(item.index);
  const meta = [item.end_date, found.serial].filter(Boolean).map(escapeHtml).join(" · ");
  return `<div class="result${excluded ? " excluded" : ""}">
    <img src="${escapeAttr(item.image)}" alt="">
    <div class="result-main">
      <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
      ${meta ? `<div class="result-meta">${meta}</div>` : ""}
    </div>
    <div class="result-price">
      <b>${currency(item.price, item.currency)}</b>
      ${deltaHtml(item, base)}
      ${sold ? `<button data-index="${item.index}">${excluded ? "Garder" : "Écarter"}</button>` : ""}
    </div>
  </div>`;
}

function bucketHtml(group, sold, base, primaryKey) {
  const isPrimary = group.key === primaryKey;
  const open = isPrimary || state.open.has(group.key);
  const values = prices(group.items);
  const range = values.length
    ? (values.length > 1 ? `${currency(Math.min(...values), group.items[0].currency)} – ${currency(Math.max(...values), group.items[0].currency)}` : currency(values[0], group.items[0].currency))
    : "aucune donnée";
  const note = LEVEL_NOTE[group.level];
  const ordered = [...group.items].sort((a, b) => Number(a.price) - Number(b.price));
  return `<section class="bucket ${group.level}${open ? " open" : ""}${isPrimary ? " primary" : ""}">
    <button class="bucket-head" data-bucket="${escapeAttr(group.key)}">
      <span class="caret">▸</span>
      <span class="bucket-title">
        <span class="bucket-label">${escapeHtml(group.text)}</span>
        <span class="bucket-range">${range}${note ? ` · ${note}` : ""}</span>
      </span>
      <span class="bucket-count">${group.items.length}</span>
    </button>
    <div class="bucket-body">${ordered.map((item) => resultHtml(item, sold, base)).join("") || `<p class="muted">Aucune ${sold ? "vente" : "annonce"} dans cette case.</p>`}</div>
  </section>`;
}

function renderSummary(basis, soldCount, activeCount) {
  const kept = basis.items;
  const dominant = kept[0]?.currency || state.listing.currency || "EUR";
  const value = median(prices(kept.filter((item) => (item.currency || "EUR") === dominant)));
  const verdict = verdictFor(Number(state.listing.displayed_price), value);
  const enough = kept.length >= 2;

  $("summary").innerHTML = `
    <div class="section-label">${basis.exact ? "PRIX DE LA CASE" : "ESTIMATION ÉLARGIE"}</div>
    <div class="summary-value">${currency(value, dominant)}</div>
    <div class="summary-basis">${kept.length ? `${kept.length} vente${kept.length > 1 ? "s" : ""} · ${escapeHtml(basis.label)}` : "Aucune vente retenue pour cette case"}</div>
    ${verdict && enough ? `<div class="verdict ${verdict.key}"><strong>${verdict.text}</strong><span>${verdict.gap}</span></div>` : ""}
    ${!enough && kept.length ? `<div class="verdict thin"><strong>Base trop mince</strong><span>${kept.length} vente sur cette case</span></div>` : ""}
    <div class="summary-grid">
      <div class="metric"><b>${soldCount}</b><span>vente${soldCount > 1 ? "s" : ""} trouvée${soldCount > 1 ? "s" : ""}</span></div>
      <div class="metric"><b>${activeCount}</b><span>annonce${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}</span></div>
      <div class="metric"><b>${currency(state.listing.displayed_price, state.listing.currency)}</b><span>prix affiché</span></div>
    </div>`;
}

function renderResults() {
  const ref = reference();
  const sold = itemsFor("sold");
  const active = itemsFor("active");
  const soldGroups = groupItems(sold, ref);
  const basis = estimateBasis(soldGroups);
  renderSummary(basis, sold.length, active.length);

  const showingSold = state.resultTab === "sold";
  const groups = showingSold ? soldGroups : groupItems(active, ref);
  // Les écarts se lisent par rapport à ce que le vendeur demande : c'est la
  // question posée en ouvrant l'annonce.
  const base = Number(state.listing.displayed_price);

  $("results").innerHTML = `
    <div class="result-tabs">
      <button class="result-tab ${showingSold ? "selected" : ""}" data-tab="sold">Vendus <b>${sold.length}</b></button>
      <button class="result-tab ${showingSold ? "" : "selected"}" data-tab="active">En vente <b>${active.length}</b></button>
    </div>
    ${base > 0 ? `<p class="list-caption">Écarts calculés vs le prix affiché (${currency(base, state.listing.currency)})</p>` : ""}
    <div class="result-list">${groups.map((group) => bucketHtml(group, showingSold, base, ref.bucket_key)).join("")
      || `<p class="muted">${showingSold ? "Aucune vente trouvée." : "Aucune annonce trouvée."}</p>`}</div>`;

  $("results").querySelectorAll("button[data-tab]").forEach((button) =>
    button.addEventListener("click", () => { state.resultTab = button.dataset.tab; renderResults(); }));
  $("results").querySelectorAll("button[data-bucket]").forEach((button) =>
    button.addEventListener("click", () => {
      const key = button.dataset.bucket;
      state.open.has(key) ? state.open.delete(key) : state.open.add(key);
      renderResults();
    }));
  $("results").querySelectorAll("button[data-index]").forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      state.excluded.has(index) ? state.excluded.delete(index) : state.excluded.add(index);
      renderResults();
    }));
  ["summary", "results", "add", "reset", "search-tools"].forEach((id) => show(id));
}

/* ---------- Cycle de vie ---------- */

function resetView({ keepListing = false } = {}) {
  state.run += 1; state.analysis = null; state.excluded.clear(); state.resultTab = "sold";
  state.override = null; state.open.clear();
  if (!keepListing) state.listing = null;
  $("query").value = "";
  ["summary", "results", "add", "reset", "search-tools", "loader", "reference"].forEach((id) => show(id, false));
  $("results").innerHTML = ""; $("summary").innerHTML = ""; $("reference").innerHTML = "";
  $("status").textContent = ""; $("status").className = "status";
}

function renderListing(listing) {
  $("listing").innerHTML = `<img src="${escapeAttr(listing.image_url)}" alt=""><div><span class="market">${escapeHtml(listing.source)}</span><strong>${escapeHtml(listing.title)}</strong><div class="price">${currency(listing.displayed_price, listing.currency)}</div></div>`;
  show("empty", false); show("workspace"); show("listing");
}

async function readListing({ autoAnalyze = true } = {}) {
  const readRun = ++state.run;
  resetView(); state.run = readRun;
  let listing;
  try { listing = await chrome.runtime.sendMessage({ type: "SCOUT_ACTIVE_LISTING" }); }
  catch { listing = { error: "Cette page n’est pas compatible avec Scout." }; }
  if (readRun !== state.run) return;
  if (!listing || listing.error) {
    show("workspace", false); show("empty");
    $("empty").querySelector("p").textContent = listing?.error || "Ouvre une annonce Vinted ou eBay.";
    return;
  }
  state.listing = listing; renderListing(listing);
  if (autoAnalyze) await analyzeListing();
}

async function analyzeListing() {
  if (!state.listing) return readListing();
  const run = ++state.run;
  show("loader"); ["summary", "results", "add", "reset", "search-tools", "reference"].forEach((id) => show(id, false));
  $("status").textContent = "Annonce détectée"; $("status").className = "status"; $("analyze").disabled = true;
  try {
    const manual = $("query").value.trim();
    const analysis = await api("/analyze", { method: "POST", body: JSON.stringify({ ...state.listing, query: manual || null }) });
    if (run !== state.run) return;
    state.analysis = analysis; state.resultTab = "sold"; state.override = null; state.open.clear(); state.excluded.clear();
    $("query").value = analysis.query;
    renderReference(); renderResults();
    $("status").textContent = analysis.warnings?.length ? analysis.warnings[0] : "Analyse terminée";
  } catch (error) {
    if (run === state.run) { $("status").textContent = error.message; $("status").className = "status error"; show("reset"); show("search-tools"); }
  } finally { if (run === state.run) show("loader", false); $("analyze").disabled = false; }
}

async function boot() {
  const token = await storageGet("scout_token");
  show("pairing", !token); show("scout", !!token); show("logout", !!token);
  if (token) await readListing();
}

$("pair").addEventListener("click", async () => { try { state.pairing = await api("/pairings", { method: "POST", body: JSON.stringify({ label: "Chrome" }) }, false); $("pair-code").textContent = state.pairing.code; $("approve").href = state.pairing.approve_url; ["pair-code", "approve", "exchange"].forEach((id) => show(id)); } catch (e) { alert(e.message); } });
$("exchange").addEventListener("click", async () => { try { const result = await api("/pairings/exchange", { method: "POST", body: JSON.stringify(state.pairing) }, false); await chrome.storage.local.set({ scout_token: result.token }); await boot(); } catch (e) { alert(e.message); } });
$("logout").addEventListener("click", async () => { await chrome.storage.local.remove("scout_token"); resetView(); await boot(); });
$("analyze").addEventListener("click", analyzeListing);
$("reset").addEventListener("click", () => readListing());
$("add").addEventListener("click", async () => { $("add").disabled = true; try { const result = await api("/cards", { method: "POST", body: JSON.stringify({ ...state.listing, sport: "Autre", player: state.listing.title }) }); $("status").textContent = result.created ? "Carte ajoutée à la Collection ✓" : "Cette annonce est déjà dans la Collection."; } catch (e) { $("status").textContent = e.message; } finally { $("add").disabled = false; } });
chrome.runtime.onMessage.addListener((message) => { if (message?.type !== "SCOUT_TAB_CHANGED") return; clearTimeout(state.timer); state.timer = setTimeout(() => readListing(), 350); });
boot();
