/*
 * Onglet « Synchroniser » : rattrape l'historique des annonces Vinted.
 *
 * Sur son profil Vinted, l'extension lit toutes les annonces (actives,
 * réservées, masquées, vendues), les rapproche des cartes CardVaults
 * (vinted-logic.js : matchWardrobe / planPair) et propose les changements :
 * liens corrigés, statuts mis à jour. Rien n'est appliqué sans validation ;
 * les choix pour les annonces réservées et masquées sont demandés.
 */
(() => {
  const STATE_LABELS = { active: "Active", sold: "Vendue", reserved: "Réservée", hidden: "Masquée", unknown: "Statut inconnu" };
  const CARD_STATUS = { collection: "En collection", a_vendre: "À vendre", reserve: "Réservée", vendu: "Vendue" };
  const BROKEN_OPTIONS = [["keep", "Ne rien changer"], ["relist", "Retirer le lien et remettre en vente"], ["unlink", "Retirer le lien seulement"]];
  const s = {
    phase: "intro", // intro | scanning | review | applying | done
    scan: null, cards: [], match: null, error: "",
    decisions: { reserved: "sold_outside", hidden: "sold_outside" },
    unchecked: new Set(), // cartes dont on décoche le changement proposé
    choices: new Map(), // annonce à vérifier → carte choisie
    broken: new Map(), // lien introuvable → keep | unlink | relist
    result: null,
  };

  const root = () => $("s-root");
  const euros = (v) => (v > 0 ? currency(v) : "—");
  const meta = (c) => [c.year, c.set_name, c.variant, c.numbered].filter(Boolean).join(" · ");
  const thumb = (url) => (url ? `<img src="${escapeAttr(url.startsWith("https://images.cardvaults.app/") ? CVVinted.cdnUrl(url) : url)}" alt="" loading="lazy">` : `<span class="v-thumb"></span>`);
  const chip = (state) => `<span class="s-chip s-${state}">${STATE_LABELS[state] || state}</span>`;

  /** Paires (sûres + choisies à la main) avec leurs changements calculés selon les choix. */
  function plans() {
    const { pairs, review } = s.match;
    // Une carte ne peut être choisie que pour une seule annonce.
    const used = new Set(pairs.map((p) => p.card.id));
    const chosen = review
      .map((r) => ({ listing: r.listing, card: r.options.find((o) => o.card.id === s.choices.get(r.listing.url))?.card }))
      .filter((p) => p.card && !used.has(p.card.id) && used.add(p.card.id));
    return [...pairs, ...chosen].map((p) => ({ ...p, plan: CVVinted.planPair(p.card, p.listing, s.decisions) }));
  }

  function actions() {
    const list = plans().filter((p) => p.plan.action && !s.unchecked.has(p.card.id)).map((p) => p.plan.action);
    for (const card of s.match.broken) {
      const { action } = CVVinted.planBroken(card, s.broken.get(card.id));
      if (action) list.push(action);
    }
    return list;
  }

  async function scan() {
    s.phase = "scanning"; s.error = ""; render();
    try {
      const [scan, cards] = await Promise.all([
        chrome.runtime.sendMessage({ type: "VINTED_SCAN" }),
        api("/vinted-sync/cards"),
      ]);
      if (!scan || scan.error) throw new Error(scan?.error || "Lecture du profil impossible");
      s.scan = scan; s.cards = cards;
      s.match = CVVinted.matchWardrobe(scan.listings, cards);
      s.unchecked.clear(); s.choices.clear(); s.broken.clear();
      s.phase = "review";
    } catch (error) {
      s.phase = "intro"; s.error = error.message;
    }
    render();
  }

  async function apply() {
    const list = actions();
    if (!list.length) return;
    s.phase = "applying"; render();
    const total = { updated: 0, errors: [], ebay_withdrawn: 0, ebay_failed: [] };
    try {
      for (let i = 0; i < list.length; i += 100) {
        const r = await api("/vinted-sync/apply", { method: "POST", body: JSON.stringify({ actions: list.slice(i, i + 100) }) });
        total.updated += r.updated; total.errors.push(...r.errors);
        total.ebay_withdrawn += r.ebay_withdrawn; total.ebay_failed.push(...r.ebay_failed);
      }
      s.result = total; s.phase = "done";
    } catch (error) {
      s.error = error.message; s.phase = "review";
    }
    render();
    window.CVVintedPanel?.refresh?.();
  }

  /* ---------- Rendu ---------- */

  function intro() {
    return `<div class="panel">
      <h1>Synchroniser avec Vinted</h1>
      <p>Pour rattraper les annonces déjà publiées : l’extension lit toutes les annonces de ton profil Vinted, vérifie les liens de tes cartes et met à jour les statuts. Tu valides tout avant que ce soit appliqué.</p>
      <p><b>1.</b> Ouvre ton profil Vinted (ta photo → Mon profil).<br><b>2.</b> Clique ci-dessous.</p>
      <button id="s-scan">Lire mon profil Vinted</button>
      ${s.error ? `<p class="status error">${escapeHtml(s.error)}</p>` : ""}
    </div>`;
  }

  function counts() {
    const by = {};
    for (const l of s.scan.listings) by[l.state] = (by[l.state] || 0) + 1;
    const parts = ["active", "reserved", "hidden", "sold", "unknown"].filter((k) => by[k]).map((k) => `${by[k]} ${STATE_LABELS[k].toLowerCase()}${by[k] > 1 && k !== "unknown" ? "s" : ""}`);
    return `${s.scan.listings.length} annonce${s.scan.listings.length > 1 ? "s" : ""} lue${s.scan.listings.length > 1 ? "s" : ""} : ${parts.join(" · ")}`;
  }

  function decisionsHtml() {
    const has = (state) => s.scan.listings.some((l) => l.state === state);
    const select = (state, options) => `<label>${state === "reserved" ? "Annonces réservées sur Vinted" : "Annonces masquées sur Vinted"}
      <select data-decision="${state}">${options.map(([v, t]) => `<option value="${v}"${s.decisions[state] === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
    const blocks = [];
    if (has("reserved")) blocks.push(select("reserved", [["sold_outside", "Vendues hors Vinted"], ["reserve", "Réservées dans CardVaults"], ["keep", "Ne rien changer"]]));
    if (has("hidden")) blocks.push(select("hidden", [["sold_outside", "Vendues hors Vinted"], ["relist", "Plus sur Vinted : lien retiré, remises en vente"], ["unlink", "Plus sur Vinted : lien retiré seulement"], ["keep", "Ne rien changer"]]));
    return blocks.length ? `<div class="s-decisions"><div class="section-label">TES CHOIX</div>${blocks.join("")}</div>` : "";
  }

  function pairRow(p) {
    const checked = !s.unchecked.has(p.card.id);
    return `<li class="s-row">
      <label class="s-check"><input type="checkbox" data-pair="${escapeAttr(p.card.id)}"${checked ? " checked" : ""} aria-label="Appliquer pour ${escapeAttr(p.card.player || "cette carte")}"></label>
      ${thumb(p.card.image_front_url)}
      <div class="s-body">
        <b>${escapeHtml(p.card.player || "Carte")}</b>
        <span class="muted">${escapeHtml(meta(p.card))}</span>
        <span class="s-listing">${chip(p.listing.state)} <a href="${escapeAttr(p.listing.url)}" target="_blank" rel="noopener">${escapeHtml(p.listing.title || "Annonce")}</a> · ${euros(p.listing.price)}</span>
        <span class="s-changes">${escapeHtml(p.plan.changes.join(" · "))}</span>
      </div>
    </li>`;
  }

  const options = (list, value) => list.map(([v, t]) => `<option value="${v}"${value === v ? " selected" : ""}>${t}</option>`).join("");

  /** Cartes marquées sur Vinted mais dont l'annonce n'existe pas sur le profil (lien bidon, carte mal marquée). */
  function brokenHtml(broken) {
    const values = new Set(broken.map((c) => s.broken.get(c.id) || "keep"));
    const all = values.size === 1 ? [...values][0] : "";
    return `<h2>Liens introuvables (${broken.length})</h2>
      <p class="muted">Ces cartes sont marquées sur Vinted, mais leur lien ne correspond à aucune annonce de ton profil (lien bidon, carte mal marquée).</p>
      <label class="s-bulk">Pour toutes
        <select data-broken-all aria-label="Choix pour tous les liens introuvables">${all ? "" : `<option value="" selected>Choix différents</option>`}${options(BROKEN_OPTIONS, all)}</select></label>
      <ul class="s-list">${broken.map((c) => {
        const plan = CVVinted.planBroken(c, s.broken.get(c.id));
        return `<li class="s-row">
          ${thumb(c.image_front_url)}
          <div class="s-body"><b>${escapeHtml(c.player || "Carte")}</b>
            <span class="muted">${escapeHtml(meta(c))} · ${escapeHtml(CARD_STATUS[c.status] || c.status || "")}</span>
            <a class="s-url" href="${escapeAttr(c.vinted_url)}" target="_blank" rel="noopener">${escapeHtml(c.vinted_url)}</a>
            <select data-broken="${escapeAttr(c.id)}" aria-label="Que faire de ${escapeAttr(c.player || "cette carte")}">${options(BROKEN_OPTIONS, s.broken.get(c.id) || "keep")}</select>
            ${plan.changes.length ? `<span class="s-changes">${escapeHtml(plan.changes.join(" · "))}</span>` : ""}
          </div>
        </li>`;
      }).join("")}</ul>`;
  }

  function review() {
    const all = plans();
    const todo = all.filter((p) => p.plan.action);
    const warnings = all.filter((p) => p.plan.warning);
    const upToDate = all.filter((p) => !p.plan.action && !p.plan.warning).length;
    const { review: toCheck, broken, orphans } = s.match;
    const n = actions().length;
    return `
      <div class="panel s-summary">
        <b>${escapeHtml(counts())}</b>
        ${s.scan.source === "page" ? `<p class="v-hint">Lu depuis la page (${escapeHtml(s.scan.apiError || "API indisponible")}) : statuts des annonces inconnus, seuls les liens seront corrigés.</p>` : ""}
        <p class="muted">${upToDate} carte${upToDate > 1 ? "s" : ""} déjà à jour · ${orphans.length} annonce${orphans.length > 1 ? "s" : ""} sans carte correspondante</p>
      </div>
      ${decisionsHtml()}
      ${s.error ? `<p class="status error">${escapeHtml(s.error)}</p>` : ""}
      <h2>À mettre à jour (${todo.length})</h2>
      ${todo.length ? `<ul class="s-list">${todo.map(pairRow).join("")}</ul>` : `<p class="muted">Rien à changer.</p>`}
      ${toCheck.length ? `<h2>À vérifier (${toCheck.length})</h2><p class="muted">Plusieurs cartes ressemblent à ces annonces : choisis la bonne.</p>
        <ul class="s-list">${toCheck.map((r) => `<li class="s-row s-review">
          ${thumb(r.listing.photo)}
          <div class="s-body">
            <span class="s-listing">${chip(r.listing.state)} <a href="${escapeAttr(r.listing.url)}" target="_blank" rel="noopener">${escapeHtml(r.listing.title || "Annonce")}</a> · ${euros(r.listing.price)}</span>
            <select data-review="${escapeAttr(r.listing.url)}" aria-label="Carte correspondant à ${escapeAttr(r.listing.title || "cette annonce")}">
              <option value="">Aucune carte</option>
              ${r.options.map((o) => `<option value="${escapeAttr(o.card.id)}"${s.choices.get(r.listing.url) === o.card.id ? " selected" : ""}>${escapeHtml(`${o.card.player} · ${meta(o.card)} · ${euros(o.card.price)}`)}</option>`).join("")}
            </select>
          </div></li>`).join("")}</ul>` : ""}
      ${broken.length ? brokenHtml(broken) : ""}
      ${warnings.length ? `<h2>À surveiller (${warnings.length})</h2><ul class="s-list">${warnings.map((p) => `<li class="s-row">${thumb(p.card.image_front_url)}<div class="s-body"><b>${escapeHtml(p.card.player || "Carte")}</b><span class="v-hint">${escapeHtml(p.plan.warning)}</span><a href="${escapeAttr(p.listing.url)}" target="_blank" rel="noopener">Ouvrir l’annonce ↗</a></div></li>`).join("")}</ul>` : ""}
      <div class="s-actions">
        <button id="s-apply" ${n ? "" : "disabled"}>Appliquer ${n} changement${n > 1 ? "s" : ""}</button>
        <button id="s-rescan" class="secondary">Relire le profil</button>
      </div>`;
  }

  function done() {
    const r = s.result;
    return `<div class="panel">
      <h1>Synchronisation faite</h1>
      <p>${r.updated} carte${r.updated > 1 ? "s" : ""} mise${r.updated > 1 ? "s" : ""} à jour${r.ebay_withdrawn ? ` · ${r.ebay_withdrawn} annonce${r.ebay_withdrawn > 1 ? "s" : ""} eBay retirée${r.ebay_withdrawn > 1 ? "s" : ""}` : ""}.</p>
      ${r.errors.length ? `<p class="status error">${r.errors.length} carte${r.errors.length > 1 ? "s" : ""} non mise${r.errors.length > 1 ? "s" : ""} à jour (introuvables).</p>` : ""}
      ${r.ebay_failed.length ? `<p class="status error">${r.ebay_failed.length} annonce${r.ebay_failed.length > 1 ? "s" : ""} eBay à retirer à la main (voir le bilan du Salon ou la fiche carte).</p>` : ""}
      <button id="s-rescan" class="secondary">Relire le profil pour vérifier</button>
    </div>`;
  }

  function render() {
    const el = root();
    if (s.phase === "intro") el.innerHTML = intro();
    else if (s.phase === "scanning") el.innerHTML = `<div class="loader"><i></i><span>Lecture de toutes les annonces du profil…</span></div>`;
    else if (s.phase === "applying") el.innerHTML = `<div class="loader"><i></i><span>Mise à jour des cartes…</span></div>`;
    else if (s.phase === "done") el.innerHTML = done();
    else el.innerHTML = review();

    $("s-scan")?.addEventListener("click", scan);
    $("s-rescan")?.addEventListener("click", scan);
    $("s-apply")?.addEventListener("click", apply);
    el.querySelectorAll("[data-decision]").forEach((select) => select.addEventListener("change", () => { s.decisions[select.dataset.decision] = select.value; render(); }));
    el.querySelectorAll("[data-pair]").forEach((box) => box.addEventListener("change", () => {
      if (box.checked) s.unchecked.delete(box.dataset.pair); else s.unchecked.add(box.dataset.pair);
      render();
    }));
    el.querySelectorAll("[data-broken]").forEach((select) => select.addEventListener("change", () => {
      s.broken.set(select.dataset.broken, select.value);
      render();
    }));
    el.querySelector("[data-broken-all]")?.addEventListener("change", (event) => {
      if (!event.target.value) return;
      for (const card of s.match.broken) s.broken.set(card.id, event.target.value);
      render();
    });
    el.querySelectorAll("[data-review]").forEach((select) => select.addEventListener("change", () => {
      if (select.value) s.choices.set(select.dataset.review, select.value); else s.choices.delete(select.dataset.review);
      render();
    }));
  }

  window.CVSyncPanel = { open: () => { if (s.phase === "intro" || s.phase === "done") render(); } };
  if (!$("sync").classList.contains("hidden")) render();
})();
