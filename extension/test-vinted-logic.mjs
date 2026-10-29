// node extension/test-vinted-logic.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = { URL };
context.globalThis = context;
vm.runInNewContext(readFileSync(new URL("./vinted-logic.js", import.meta.url), "utf8"), context);
const V = context.CVVinted;

// URL d'annonce
assert.equal(V.listingUrl("https://www.vinted.fr/items/123456-carte-wemby?referrer=catalog"), "https://www.vinted.fr/items/123456-carte-wemby");
assert.equal(V.listingUrl("https://vinted.fr/items/123456/"), "https://www.vinted.fr/items/123456");
assert.equal(V.listingUrl("https://www.vinted.fr/items/new"), null);
assert.equal(V.listingUrl("https://www.vinted.fr/items/123/edit"), null);
assert.equal(V.listingUrl("https://www.vinted.fr/member/42"), null);
assert.equal(V.listingUrl("https://evil.example/items/123"), null);
assert.ok(V.isNewItemUrl("https://www.vinted.fr/items/new?x=1"));

// Association automatique : seulement juste après la publication, dans l'onglet rempli
const now = 1_000_000_000;
const session = { phase: "awaiting_publish", tabId: 7, filledAt: now - 60_000, submittedAt: null };
const item = "https://www.vinted.fr/items/999-carte";
assert.ok(V.shouldAutoLink(session, 7, item, "https://www.vinted.fr/items/new", now), "arrivée directe depuis le formulaire");
assert.ok(!V.shouldAutoLink(session, 7, item, "https://www.vinted.fr/catalog", now), "autre annonce consultée : pas d'association");
assert.ok(V.shouldAutoLink({ ...session, submittedAt: now - 30_000 }, 7, item, "https://www.vinted.fr/catalog", now), "clic Ajouter récent");
assert.ok(!V.shouldAutoLink({ ...session, submittedAt: now - 10 * 60_000 }, 7, item, "https://www.vinted.fr/catalog", now), "clic trop ancien");
assert.ok(!V.shouldAutoLink(session, 8, item, "https://www.vinted.fr/items/new", now), "autre onglet");
assert.ok(!V.shouldAutoLink({ ...session, phase: "linked" }, 7, item, "https://www.vinted.fr/items/new", now), "déjà associée");
assert.ok(!V.shouldAutoLink({ ...session, filledAt: now - 2 * 3600_000 }, 7, item, "https://www.vinted.fr/items/new", now), "formulaire trop ancien");
assert.ok(!V.shouldAutoLink(null, 7, item, "https://www.vinted.fr/items/new", now));

// Images, pastille
assert.equal(V.cdnUrl("https://images.cardvaults.app/u/c_front.jpg"), "https://collection.cardvaults.app/cdn/u/c_front.jpg");
assert.equal(V.numberedBadge("99"), "NUMÉROTÉE /99");
assert.equal(V.numberedBadge("/25"), "NUMÉROTÉE /25");
assert.equal(V.numberedBadge(""), "");

// File : sélection de l'app (dans son ordre) sinon cartes à vendre, puis recherche sans accents
const cards = [
  { id: "a", status: "a_vendre", player: "Nikola Jokić", team: "Nuggets" },
  { id: "b", status: "collection", player: "LeBron James", team: "Lakers" },
  { id: "c", status: "a_vendre", player: "Luka Dončić", team: "Mavericks", set_name: "Prizm" },
];
assert.deepEqual(V.filterQueue(cards).map((c) => c.id), ["a", "c"]);
assert.deepEqual(V.filterQueue(cards, { selection: ["c", "b", "zz"] }).map((c) => c.id), ["c", "b"]);
assert.deepEqual(V.filterQueue(cards, { search: "jokic" }).map((c) => c.id), ["a"]);
assert.deepEqual(V.filterQueue(cards, { search: "doncic prizm" }).map((c) => c.id), ["c"]);

console.log("vinted-logic : tous les tests passent");
