// node extension/test-vinted-logic.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = { URL };
context.globalThis = context;
vm.runInNewContext(readFileSync(new URL("./vinted-logic.js", import.meta.url), "utf8"), context);
const V = context.CVVinted;
// Les tableaux créés dans le contexte vm ont un autre prototype : on compare des copies simples.
const plain = (value) => JSON.parse(JSON.stringify(value));

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

// Groupes : équipe par équipe, « Sans équipe » en dernier, ordre conservé dans un groupe
const teamCards = [
  { id: "1", team: "Lakers", player: "LeBron James", price: 5, year: "2023-24" },
  { id: "2", team: "", player: "Inconnu", price: 1, year: null },
  { id: "3", team: "Bulls", player: "Zach LaVine", price: 9, year: "2024-25" },
  { id: "4", team: "Lakers", player: "Anthony Davis", price: 2, year: "2024-25" },
];
const groups = V.groupCards(teamCards, "team");
assert.deepEqual(plain(groups.map((g) => g.label)), ["Bulls", "Lakers", "Sans équipe"]);
assert.deepEqual(plain(groups[1].cards.map((c) => c.id)), ["1", "4"]);
assert.deepEqual(plain(V.groupCards(teamCards, "year").map((g) => g.label)), ["2024-25", "2023-24", "Sans année"]);
assert.equal(V.groupCards(teamCards, "none").length, 1);
assert.deepEqual(plain(V.inGroup(teamCards, { by: "team", key: "Lakers" }).map((c) => c.id)), ["1", "4"]);
assert.deepEqual(plain(V.inGroup(teamCards, { by: "team", key: null }).map((c) => c.id)), ["2"]);
assert.deepEqual(plain(V.sortCards(teamCards, "price_desc").map((c) => c.id)), ["3", "1", "4", "2"]);
assert.deepEqual(plain(V.sortCards(teamCards, "player").map((c) => c.id)), ["4", "2", "1", "3"]);
assert.deepEqual(plain(V.sortCards(teamCards, "recent").map((c) => c.id)), ["1", "2", "3", "4"]);

// Cartes sans prix, lien eBay, prix saisi
const priced = [
  { id: "p1", status: "a_vendre", player: "A", price: 5 },
  { id: "p2", status: "a_vendre", player: "B", price: null },
];
assert.deepEqual(plain(V.filterQueue(priced).map((c) => c.id)), ["p1", "p2"]);
assert.deepEqual(plain(V.filterQueue(priced, { missingPrice: true }).map((c) => c.id)), ["p2"]);
assert.equal(V.ebaySoldUrl("Victor Wembanyama 2023-24 Prizm #136"), "https://www.ebay.com/sch/i.html?_nkw=Victor+Wembanyama+2023-24+Prizm+%23136&LH_Sold=1&LH_Complete=1");
assert.equal(V.ebaySoldUrl(""), null);
assert.equal(V.parsePrice("12,50"), 12.5);
assert.equal(V.parsePrice(" 12 € "), 12);
assert.equal(V.parsePrice("1 200"), 1200);
assert.equal(V.parsePrice("0"), null);
assert.equal(V.parsePrice("abc"), null);
assert.equal(V.parsePrice("12,555"), null);

// Recherche eBay : celle de l'API, sinon reconstruite depuis la carte
assert.equal(V.ebayQueryOf({ ebay_query: "API", player: "X" }), "API");
assert.equal(V.ebayQueryOf({ player: "Ben Saraf", year: "2025-26", set_name: "Topps Chrome", variant: "Gold", numbered: "/50" }), "Ben Saraf 2025-26 Topps Chrome Gold /50");

// Redirection vers le profil après « Ajouter »
assert.ok(V.isMemberUrl("https://www.vinted.fr/member/123456-fyrex"));
assert.ok(!V.isMemberUrl("https://www.vinted.fr/items/123"));
const waiting = { phase: "awaiting_publish", tabId: 3, filledAt: now - 60_000, leftFormAt: now - 20_000, submittedAt: null };
assert.ok(V.expectsNewListing(waiting, 3, now));
assert.ok(!V.expectsNewListing(waiting, 4, now), "autre onglet");
assert.ok(!V.expectsNewListing({ ...waiting, leftFormAt: now - 10 * 60_000 }, 3, now), "trop ancien");
assert.ok(V.expectsNewListing({ ...waiting, leftFormAt: null, submittedAt: now - 30_000 }, 3, now));

const profile = [
  { url: "https://www.vinted.fr/items/7001-ben-saraf-2025-26-topps-chrome-next-stop-signatures-75?referrer=member", title: "Ben Saraf 2025-26 Topps Chrome Next Stop Signatures /75, marque: Topps, 20,00 €" },
  { url: "https://www.vinted.fr/items/6990-luka-doncic-prizm", title: "Luka Dončić Prizm, 80,00 €" },
  { url: "https://www.vinted.fr/items/6800-ben-saraf-obsidian", title: "Ben Saraf Obsidian, 2,00 €" },
];
const found = V.pickPublishedListing(profile, { player: "Ben Saraf", price: 20 });
assert.equal(found.url, "https://www.vinted.fr/items/7001-ben-saraf-2025-26-topps-chrome-next-stop-signatures-75");
assert.ok(found.confident);
assert.ok(!V.pickPublishedListing(profile, { player: "Ben Saraf", price: 25 }).confident, "prix différent : à confirmer");
assert.equal(V.pickPublishedListing(profile, { player: "Luka Dončić", price: 80 }).url, "https://www.vinted.fr/items/6990-luka-doncic-prizm");
assert.equal(V.pickPublishedListing(profile, { player: "Victor Wembanyama", price: 5 }), null);
const late = [profile[1], { url: "https://www.vinted.fr/items/2-a", title: "a" }, profile[2]];
assert.ok(!V.pickPublishedListing(late, { player: "Ben Saraf", price: 2 }).confident, "trop loin dans la liste : à confirmer");

// Rattrapage : profil Vinted ↔ cartes
const wardrobe = [
  { url: "https://www.vinted.fr/items/7001-ben-saraf", title: "Ben Saraf 2025-26 Topps Topps Chrome Next Stop Signatures /75", price: 20, state: "active" },
  { url: "https://www.vinted.fr/items/7002-ben-saraf", title: "Ben Saraf 2025-26 Topps Topps Chrome Gold Lava Refractor /50", price: 15, state: "sold" },
  { url: "https://www.vinted.fr/items/7003-lebron", title: "LeBron James 2023-24 Panini Prizm Silver", price: 30, state: "reserved" },
  { url: "https://www.vinted.fr/items/7004-wemby", title: "Victor Wembanyama 2023-24 Panini Prizm", price: 50, state: "active" },
  { url: "https://www.vinted.fr/items/7005-inconnu", title: "Lot de 10 cartes NBA", price: 5, state: "active" },
  { url: "https://www.vinted.fr/items/7006-trae", title: "Trae Young 2024-25 Panini Obsidian Hotspot /60", price: 7, state: "hidden" },
];
const mine = [
  { id: "saraf75", status: "a_vendre", player: "Ben Saraf", title: "Ben Saraf 2025-26 Topps Topps Chrome Next Stop Signatures /75", numbered: "/75", price: 20, vinted_url: "https://www.vinted.fr/items/1-bidon" },
  { id: "saraf50", status: "a_vendre", player: "Ben Saraf", title: "Ben Saraf 2025-26 Topps Topps Chrome Gold Lava Refractor /50", numbered: "/50", price: 15, vinted_url: null },
  { id: "lebron", status: "a_vendre", player: "LeBron James", title: "LeBron James 2023-24 Panini Prizm Silver", price: 30, vinted_url: "https://www.vinted.fr/items/7003-lebron" },
  { id: "wemby1", status: "a_vendre", player: "Victor Wembanyama", title: "Victor Wembanyama 2023-24 Panini Prizm", price: 50, vinted_url: null },
  { id: "wemby2", status: "a_vendre", player: "Victor Wembanyama", title: "Victor Wembanyama 2023-24 Panini Prizm", price: 45, vinted_url: null },
  { id: "trae", status: "collection", player: "Trae Young", title: "Trae Young 2024-25 Panini Obsidian Hotspot /60", numbered: "/60", price: 7, vinted_url: "https://www.vinted.fr/items/9-bidon" },
  { id: "perdue", status: "a_vendre", player: "Zion Williamson", title: "Zion Williamson Prizm", price: 9, vinted_url: "https://www.vinted.fr/items/123-bidon" },
];
const m = V.matchWardrobe(wardrobe, mine);
const pairOf = (id) => m.pairs.find((p) => p.card.id === id);
assert.equal(pairOf("lebron").kind, "linked", "lien déjà bon reconnu par l'identifiant");
assert.equal(pairOf("saraf75").listing.url, wardrobe[0].url, "lien bidon remplacé par la bonne annonce");
assert.equal(pairOf("saraf50").listing.url, wardrobe[1].url, "le tirage départage les deux Ben Saraf");
assert.equal(pairOf("trae").listing.url, wardrobe[5].url);
assert.equal(m.review.length, 1, "deux Wemby identiques : à vérifier");
assert.equal(m.review[0].listing.url, wardrobe[3].url);
assert.deepEqual(plain(m.review[0].options.map((o) => o.card.id)), ["wemby1", "wemby2"], "le prix identique passe en premier");
assert.deepEqual(plain(m.orphans.map((l) => l.url)), [wardrobe[4].url]);
assert.deepEqual(plain(m.broken.map((c) => c.id)), ["perdue"]);
assert.equal(V.matchScore({ player: "Ben Saraf", numbered: "/75", title: "Ben Saraf /75" }, { title: "Ben Saraf /50" }), 0);

// Changements selon l'état de l'annonce et les choix
const decisions = { reserved: "sold_outside", hidden: "unlink" };
const p75 = V.planPair(mine[0], wardrobe[0], decisions);
assert.deepEqual(plain(p75.action), { card_id: "saraf75", vinted_url: "https://www.vinted.fr/items/7001-ben-saraf" });
assert.deepEqual(plain(p75.changes), ["Lien corrigé"]);
const p50 = V.planPair(mine[1], wardrobe[1], decisions);
assert.deepEqual(plain(p50.action), { card_id: "saraf50", status: "vendu", price: 15, vinted_url: "https://www.vinted.fr/items/7002-ben-saraf" });
assert.deepEqual(plain(V.planPair(mine[2], wardrobe[2], decisions).action), { card_id: "lebron", status: "vendu" }, "réservée = vendue hors Vinted");
assert.equal(V.planPair(mine[2], wardrobe[2], { reserved: "keep" }).action, null);
assert.deepEqual(plain(V.planPair(mine[2], wardrobe[2], { reserved: "reserve" }).action), { card_id: "lebron", status: "reserve" });
assert.deepEqual(plain(V.planPair(mine[5], wardrobe[5], decisions).action), { card_id: "trae", clear_url: true }, "masquée : lien retiré");
assert.deepEqual(plain(V.planPair(mine[5], wardrobe[5], { hidden: "sold_outside" }).action), { card_id: "trae", status: "vendu", vinted_url: "https://www.vinted.fr/items/7006-trae" });
const soldButOnline = V.planPair({ ...mine[2], status: "vendu" }, { ...wardrobe[2], state: "active" }, decisions);
assert.equal(soldButOnline.action, null);
assert.ok(soldButOnline.warning);
assert.deepEqual(plain(V.planPair({ ...mine[3], status: "collection" }, wardrobe[3], decisions).action), { card_id: "wemby1", status: "a_vendre", vinted_url: "https://www.vinted.fr/items/7004-wemby" });

console.log("vinted-logic : tous les tests passent");
