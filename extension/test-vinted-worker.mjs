// node extension/test-vinted-worker.mjs
// Rejoue le service worker réel avec un faux Chrome : remplissage, puis
// arrivée sur l'annonce ou sur le profil après « Ajouter ».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

function makeWorker() {
  const listeners = { message: [], updated: [] };
  const sessionStore = {};
  const panel = [];
  const patches = [];
  const tabs = new Map([[5, { id: 5, url: "https://www.vinted.fr/catalog", active: true }]]);
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      sendMessage: async (message) => { panel.push(message); },
    },
    sidePanel: { setPanelBehavior() {} },
    storage: {
      session: { get: async (key) => ({ [key]: sessionStore[key] }), set: async (o) => Object.assign(sessionStore, o) },
      local: { get: async () => ({ scout_token: "tok" }) },
    },
    tabs: {
      onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
      onActivated: { addListener() {} },
      query: async () => [tabs.get(5)],
      get: async (id) => tabs.get(id),
      update: async (id, props) => { Object.assign(tabs.get(id), props); return tabs.get(id); },
      reload: async () => {},
      create: async () => { throw new Error("pas d'onglet attendu"); },
      sendMessage: async () => {},
    },
  };
  const fetch = async (url, options) => {
    patches.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({}) };
  };
  const context = { chrome, fetch, URL, console, setTimeout, Date };
  context.globalThis = context;
  context.self = context;
  context.importScripts = () => vm.runInContext(read("vinted-logic.js"), context);
  vm.createContext(context);
  vm.runInContext(read("service-worker.js"), context);

  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  return {
    panel, patches, sessionStore,
    async message(message, tabId = null) {
      let response;
      for (const fn of listeners.message) fn(message, { tab: tabId ? { id: tabId } : undefined }, (r) => { response = r; });
      await settle();
      return response;
    },
    async navigate(url) {
      tabs.get(5).url = url;
      for (const fn of listeners.updated) fn(5, { url }, tabs.get(5));
      await settle();
    },
  };
}

async function fillAndPublish(worker) {
  const draft = { title: "Ben Saraf 2025-26 Topps Chrome Next Stop Signatures /75", description: "…", price: 20, brand: "Topps", photos: [] };
  assert.equal((await worker.message({ type: "VINTED_FILL", cardId: "card-1", player: "Ben Saraf", prevStatus: "a_vendre", draft }))?.accepted, true);
  await worker.navigate("https://www.vinted.fr/items/new");
  const pending = await worker.message({ type: "VINTED_GET_PENDING_DRAFT" }, 5);
  assert.equal(pending.draft.cardId, "card-1");
  await worker.message({ type: "VINTED_FORM_FILLED", cardId: "card-1" }, 5);
}

// 1. Vinted renvoie sur le profil : l'annonce en tête est retrouvée et associée.
{
  const worker = makeWorker();
  await fillAndPublish(worker);
  await worker.navigate("https://www.vinted.fr/member/123456-fyrex");
  await worker.message({
    type: "VINTED_PROFILE_LISTINGS",
    listings: [
      { url: "https://www.vinted.fr/items/7001-ben-saraf-2025-26-topps-chrome-next-stop-signatures-75", title: "Ben Saraf 2025-26 Topps Chrome Next Stop Signatures /75, 20,00 €" },
      { url: "https://www.vinted.fr/items/6990-luka-doncic", title: "Luka Dončić, 80,00 €" },
    ],
  }, 5);
  assert.equal(worker.patches.length, 1);
  assert.match(worker.patches[0].url, /\/cards\/card-1\/vinted-listing$/);
  assert.equal(worker.patches[0].body.url, "https://www.vinted.fr/items/7001-ben-saraf-2025-26-topps-chrome-next-stop-signatures-75");
  assert.ok(worker.panel.some((m) => m.event === "linked" && m.cardId === "card-1"));
}

// 2. Prix différent sur Vinted : le panneau demande confirmation, rien n'est associé seul.
{
  const worker = makeWorker();
  await fillAndPublish(worker);
  await worker.navigate("https://www.vinted.fr/member/123456-fyrex");
  await worker.message({
    type: "VINTED_PROFILE_LISTINGS",
    listings: [{ url: "https://www.vinted.fr/items/7001-ben-saraf-topps", title: "Ben Saraf Topps, 25,00 €" }],
  }, 5);
  assert.equal(worker.patches.length, 0);
  assert.ok(worker.panel.some((m) => m.event === "detected" && m.url === "https://www.vinted.fr/items/7001-ben-saraf-topps"));
}

// 3. Arrivée directe sur l'annonce créée.
{
  const worker = makeWorker();
  await fillAndPublish(worker);
  await worker.navigate("https://www.vinted.fr/items/7001-ben-saraf");
  assert.equal(worker.patches.length, 1);
  assert.equal(worker.patches[0].body.url, "https://www.vinted.fr/items/7001-ben-saraf");
}

// 4. Profil visité sans publication récente : rien n'est associé.
{
  const worker = makeWorker();
  await worker.navigate("https://www.vinted.fr/member/123456-fyrex");
  await worker.message({ type: "VINTED_PROFILE_LISTINGS", listings: [{ url: "https://www.vinted.fr/items/1-ben-saraf", title: "Ben Saraf" }] }, 5);
  assert.equal(worker.patches.length, 0);
}

console.log("service worker Vinted : tous les scénarios passent");
