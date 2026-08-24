const API = "https://collection-api.cardvaults.app/api/extension";
const state = { listing: null, analysis: null, excluded: new Set(), pairing: null };
const $ = (id) => document.getElementById(id);
const show = (id, visible = true) => $(id).classList.toggle("hidden", !visible);

async function storageGet(key) { return (await chrome.storage.local.get(key))[key]; }
async function api(path, options = {}, authenticated = true) {
  const token = await storageGet("scout_token");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `Erreur ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function boot() {
  const token = await storageGet("scout_token");
  show("pairing", !token); show("scout", !!token); show("logout", !!token);
  if (token) await readListing();
}

async function readListing() {
  const listing = await chrome.runtime.sendMessage({ type: "SCOUT_ACTIVE_LISTING" });
  if (!listing || listing.error) { $("status").textContent = listing?.error || "Ouvre une annonce Vinted ou eBay."; return; }
  state.listing = listing;
  $("listing").innerHTML = `<div class="listing"><img src="${escapeHtml(listing.image_url)}"><div><strong>${escapeHtml(listing.title)}</strong><p>${listing.displayed_price ?? "—"} € · ${listing.source}</p></div></div>`;
  show("listing"); $("status").textContent = "Annonce détectée.";
}

function escapeHtml(value) { const d = document.createElement("div"); d.textContent = value || ""; return d.innerHTML; }
function activeSold() { return (state.analysis?.sold?.results || []).filter((_, index) => !state.excluded.has(index)); }
function median(values) { if (!values.length) return null; const sorted = [...values].sort((a,b) => a-b); const m = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[m] : (sorted[m-1]+sorted[m])/2; }

function renderResults() {
  const sold = state.analysis?.sold?.results || [];
  const active = state.analysis?.active?.results || [];
  const value = median(activeSold().map((item) => Number(item.price)).filter(Number.isFinite));
  const listingPrice = Number(state.listing.displayed_price);
  const delta = value != null && Number.isFinite(listingPrice) ? value - listingPrice : null;
  const ratio = delta != null && listingPrice > 0 ? (delta / listingPrice) * 100 : null;
  const deltaLabel = delta == null ? "" : ` · écart ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} €${ratio == null ? "" : ` (${ratio.toFixed(0)} %)`}`;
  $("summary").innerHTML = `<strong>Valeur médiane : ${value == null ? "indisponible" : `${value.toFixed(2)} €`}</strong><p>${activeSold().length} comparable(s) retenu(s) · prix annonce ${state.listing.displayed_price ?? "—"} €${deltaLabel}</p>`;
  show("summary");
  const soldHtml = sold.map((item, index) => `<div class="result ${state.excluded.has(index) ? "excluded" : ""}"><img src="${escapeHtml(item.image)}"><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title)}</a><div><strong>${Number(item.price).toFixed(2)} €</strong><button data-index="${index}">${state.excluded.has(index) ? "Garder" : "Écarter"}</button></div></div>`).join("");
  const activeHtml = active.map((item) => `<div class="result"><img src="${escapeHtml(item.image)}"><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title)}</a><strong>${Number(item.price).toFixed(2)} €</strong></div>`).join("");
  $("results").innerHTML = `<h3>Ventes terminées</h3>${soldHtml || '<p class="muted">Aucune vente trouvée.</p>'}<h3>Annonces actives</h3>${activeHtml || '<p class="muted">Aucune annonce trouvée.</p>'}`;
  $("results").querySelectorAll("button[data-index]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.index); state.excluded.has(index) ? state.excluded.delete(index) : state.excluded.add(index); renderResults();
  }));
}

$("pair").addEventListener("click", async () => {
  try {
    state.pairing = await api("/pairings", { method: "POST", body: JSON.stringify({ label: "Chrome" }) }, false);
    $("pair-code").textContent = state.pairing.code; $("approve").href = state.pairing.approve_url;
    show("pair-code"); show("approve"); show("exchange");
  } catch (error) { alert(error.message); }
});

$("exchange").addEventListener("click", async () => {
  try {
    const result = await api("/pairings/exchange", { method: "POST", body: JSON.stringify(state.pairing) }, false);
    await chrome.storage.local.set({ scout_token: result.token }); await boot();
  } catch (error) { alert(error.message); }
});

$("logout").addEventListener("click", async () => { await chrome.storage.local.remove("scout_token"); await boot(); });
$("analyze").addEventListener("click", async () => {
  if (!state.listing) return readListing();
  $("analyze").disabled = true; $("status").textContent = "Analyse en cours…";
  try {
    state.analysis = await api("/analyze", { method: "POST", body: JSON.stringify({ ...state.listing, query: $("query").value || null }) });
    $("query").value = state.analysis.query; state.excluded.clear(); renderResults(); show("add"); $("status").textContent = "Analyse terminée.";
  } catch (error) { $("status").textContent = error.message; } finally { $("analyze").disabled = false; }
});

$("add").addEventListener("click", async () => {
  const id = state.analysis?.identification || {};
  $("add").disabled = true;
  try {
    const result = await api("/cards", { method: "POST", body: JSON.stringify({
      ...state.listing, sport: id.sport || "Autre", player: id.player, team: id.team, year: id.year,
      brand: id.brand, set_name: id.set, card_number: id.card_number, parallel_name: id.parallel,
    }) });
    $("status").textContent = result.created ? "Carte ajoutée à la Collection ✓" : "Cette annonce était déjà dans la Collection.";
  } catch (error) { $("status").textContent = error.message; } finally { $("add").disabled = false; }
});

boot();
