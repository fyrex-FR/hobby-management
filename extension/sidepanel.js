const API = "https://collection-api.cardvaults.app/api/extension";
const state = { listing: null, analysis: null, excluded: new Set(), pairing: null, run: 0, timer: null };
const $ = (id) => document.getElementById(id);
const show = (id, visible = true) => $(id).classList.toggle("hidden", !visible);
const escapeHtml = (value) => { const d = document.createElement("div"); d.textContent = value || ""; return d.innerHTML; };
const escapeAttr = (value) => String(value || "").replace(/[&"'<>]/g, (char) => ({ "&":"&amp;", '"':"&quot;", "'":"&#39;", "<":"&lt;", ">":"&gt;" }[char]));
const currency = (value, code = "EUR") => value == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: code || "EUR" }).format(Number(value));

async function storageGet(key) { return (await chrome.storage.local.get(key))[key]; }
async function api(path, options = {}, authenticated = true) {
  const token = await storageGet("scout_token");
  const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `Erreur ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function resetView({ keepListing = false } = {}) {
  state.run += 1; state.analysis = null; state.excluded.clear();
  if (!keepListing) state.listing = null;
  $("query").value = "";
  ["summary", "results", "add", "reset", "search-tools", "loader"].forEach((id) => show(id, false));
  $("results").innerHTML = ""; $("summary").innerHTML = ""; $("status").textContent = ""; $("status").className = "status";
}

function renderListing(listing) {
  $("listing").innerHTML = `<img src="${escapeAttr(listing.image_url)}"><div><span class="market">${escapeHtml(listing.source)}</span><strong>${escapeHtml(listing.title)}</strong><div class="price">${currency(listing.displayed_price, listing.currency)}</div></div>`;
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
    show("workspace", false); show("empty"); $("empty").querySelector("p").textContent = listing?.error || "Ouvre une annonce Vinted ou eBay."; return;
  }
  state.listing = listing; renderListing(listing);
  if (autoAnalyze) await analyzeListing();
}

function parseSoldHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("li.s-item")].map((row) => {
    const title = row.querySelector(".s-item__title")?.textContent?.trim() || "";
    const priceText = row.querySelector(".s-item__price")?.textContent || "";
    const url = row.querySelector("a.s-item__link")?.href || "";
    const image = row.querySelector(".s-item__image-img")?.src || "";
    const value = Number.parseFloat((priceText.match(/[0-9][0-9\s.,]*/)?.[0] || "").replace(/\s/g, "").replace(",", "."));
    const itemId = url.match(/\/itm\/(?:[^/?]+\/)?(\d{9,15})/)?.[1] || "";
    const code = /\bUSD\b|\$/.test(priceText) ? "USD" : /\bGBP\b|£/.test(priceText) ? "GBP" : "EUR";
    return title && url && Number.isFinite(value) ? { title, price: value, currency: code, url, image, item_id: itemId } : null;
  }).filter(Boolean).slice(0, 40);
}

async function fetchBrowserSold(query) {
  const url = `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&rt=nc`;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return [];
    return parseSoldHtml(await response.text());
  } catch { return []; }
}

function activeSold() { return (state.analysis?.sold?.results || []).filter((_, index) => !state.excluded.has(index)); }
function median(values) { if (!values.length) return null; const sorted = [...values].sort((a,b) => a-b); const m = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[m] : (sorted[m-1]+sorted[m])/2; }
function resultHtml(item, index, sold) {
  return `<div class="result ${sold && state.excluded.has(index) ? "excluded" : ""}"><img src="${escapeAttr(item.image)}"><a href="${escapeAttr(item.url)}" target="_blank">${escapeHtml(item.title)}</a><div class="result-price">${currency(item.price,item.currency)}${sold ? `<button data-index="${index}">${state.excluded.has(index) ? "Garder" : "Écarter"}</button>` : ""}</div></div>`;
}
function renderResults() {
  const sold = state.analysis?.sold?.results || [], active = state.analysis?.active?.results || [];
  const kept = activeSold(), dominantCurrency = kept[0]?.currency || "EUR";
  const sameCurrencyPrices = kept.filter((x) => (x.currency || "EUR") === dominantCurrency).map((x) => Number(x.price)).filter(Number.isFinite);
  const value = median(sameCurrencyPrices);
  $("summary").innerHTML = `<div class="section-label">ESTIMATION</div><div class="summary-value">${currency(value,dominantCurrency)}</div><div class="summary-grid"><div class="metric"><b>${kept.length}</b><span>ventes retenues</span></div><div class="metric"><b>${active.length}</b><span>annonces actives</span></div><div class="metric"><b>${currency(state.listing.displayed_price,state.listing.currency)}</b><span>prix affiché</span></div></div>`;
  $("results").innerHTML = `<h2>Ventes terminées</h2>${sold.map((x,i)=>resultHtml(x,i,true)).join("") || '<p class="muted">Aucune vente fiable trouvée.</p>'}<h2>Annonces actives</h2>${active.map((x,i)=>resultHtml(x,i,false)).join("") || '<p class="muted">Aucune annonce trouvée.</p>'}`;
  $("results").querySelectorAll("button[data-index]").forEach((button) => button.addEventListener("click", () => { const i=Number(button.dataset.index); state.excluded.has(i)?state.excluded.delete(i):state.excluded.add(i); renderResults(); }));
  ["summary","results","add","reset","search-tools"].forEach((id)=>show(id));
}

async function analyzeListing() {
  if (!state.listing) return readListing();
  const run = ++state.run; show("loader"); show("summary",false); show("results",false); show("add",false); show("reset",false); show("search-tools",false);
  $("status").textContent = "Annonce détectée"; $("status").className = "status"; $("analyze").disabled = true;
  try {
    const manual = $("query").value.trim();
    const sold = await fetchBrowserSold(manual || state.listing.title);
    if (run !== state.run) return;
    const analysis = await api("/analyze", { method:"POST", body:JSON.stringify({ ...state.listing, query:manual||null, browser_sold:sold }) });
    if (run !== state.run) return;
    state.analysis=analysis; $("query").value=analysis.query; state.excluded.clear(); renderResults(); $("status").textContent="Analyse terminée";
  } catch(error) { if(run===state.run){ $("status").textContent=error.message; $("status").className="status error"; show("reset"); show("search-tools"); } }
  finally { if(run===state.run) show("loader",false); $("analyze").disabled=false; }
}

async function boot() { const token=await storageGet("scout_token"); show("pairing",!token); show("scout",!!token); show("logout",!!token); if(token) await readListing(); }
$("pair").addEventListener("click",async()=>{try{state.pairing=await api("/pairings",{method:"POST",body:JSON.stringify({label:"Chrome"})},false);$("pair-code").textContent=state.pairing.code;$("approve").href=state.pairing.approve_url;["pair-code","approve","exchange"].forEach((id)=>show(id));}catch(e){alert(e.message);}});
$("exchange").addEventListener("click",async()=>{try{const result=await api("/pairings/exchange",{method:"POST",body:JSON.stringify(state.pairing)},false);await chrome.storage.local.set({scout_token:result.token});await boot();}catch(e){alert(e.message);}});
$("logout").addEventListener("click",async()=>{await chrome.storage.local.remove("scout_token");resetView();await boot();});
$("analyze").addEventListener("click",analyzeListing); $("reset").addEventListener("click",()=>readListing());
$("add").addEventListener("click",async()=>{$("add").disabled=true;try{const result=await api("/cards",{method:"POST",body:JSON.stringify({...state.listing,sport:"Autre",player:state.listing.title})});$("status").textContent=result.created?"Carte ajoutée à la Collection ✓":"Cette annonce est déjà dans la Collection.";}catch(e){$("status").textContent=e.message;}finally{$("add").disabled=false;}});
chrome.runtime.onMessage.addListener((message)=>{if(message?.type!=="SCOUT_TAB_CHANGED")return;clearTimeout(state.timer);state.timer=setTimeout(()=>readListing(),350);});
boot();
