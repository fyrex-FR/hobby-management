// Fetch proxy openclaw : charge une URL dans un vrai navigateur headless
// (Chromium/Playwright) et renvoie le HTML rendu. Sert à récupérer les pages
// de ventes eBay depuis une IP "propre" (celle de la machine openclaw), en se
// faisant passer pour un navigateur humain — car eBay 403 les requêtes qui ont
// l'air automatisées, même depuis une IP résidentielle valide.
//
// Contrat consommé par CardVaults (services/ebay_sold_scraper.py) :
//   POST /fetch
//   Header  : X-Auth-Token: <FETCH_TOKEN>
//   Body    : { "url": "<url à charger>" }
//   200     : { "status": <int>, "html": "<html rendu>", "final_url": "<url>" }
//   401     : token manquant/incorrect
//   400     : url manquante
//   502     : { "error": "<message>" }

import express from 'express';
import { chromium } from 'playwright';

const app = express();
app.use(express.json({ limit: '2mb' }));

const TOKEN = process.env.FETCH_TOKEN || '';
const PORT = process.env.PORT || 8899;
const NAV_TIMEOUT = 30000;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// Sortie via un proxy externe (résidentiel/mobile) si FETCH_PROXY_URL est
// défini, ex. http://user:pass@host:port . Optionnel : inutile si l'IP locale
// d'openclaw fonctionne déjà dans un vrai navigateur.
function proxyFromEnv() {
  const raw = process.env.FETCH_PROXY_URL;
  if (!raw) return undefined;
  const u = new URL(raw);
  const proxy = { server: `${u.protocol}//${u.host}` };
  if (u.username) proxy.username = decodeURIComponent(u.username);
  if (u.password) proxy.password = decodeURIComponent(u.password);
  return proxy;
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    const proxy = proxyFromEnv();
    if (proxy) console.log(`sortie via proxy ${proxy.server}`);
    browserPromise = chromium.launch({
      headless: true,
      proxy,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  }
  return browserPromise;
}

// Contexte partagé (persistant en mémoire) : les cookies récupérés au "warmup"
// eBay restent d'une requête à l'autre, ce qui rend la session crédible.
let ctxPromise = null;
async function getContext() {
  if (!ctxPromise) {
    ctxPromise = (async () => {
      const browser = await getBrowser();
      const context = await browser.newContext({
        userAgent: UA,
        locale: 'en-US',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1280, height: 900 },
      });
      // Masque les signaux d'automatisation les plus évidents.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      });
      // Chauffe la session : visite la home eBay pour obtenir des cookies avant
      // de taper les pages de recherche (best-effort).
      try {
        const p = await context.newPage();
        await p.goto('https://www.ebay.com/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await p.waitForTimeout(2500);
        await p.close();
      } catch (e) {
        console.warn('warmup eBay échoué (on continue):', String(e && e.message ? e.message : e));
      }
      return context;
    })();
  }
  return ctxPromise;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/fetch', async (req, res) => {
  if (!TOKEN || req.get('X-Auth-Token') !== TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'missing url' });
  }

  let page;
  try {
    const context = await getContext();
    page = await context.newPage();
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    // Laisse eBay rendre la liste des résultats (best-effort).
    await page.waitForSelector('li.s-item', { timeout: 8000 }).catch(() => {});
    const html = await page.content();
    res.json({ status: resp ? resp.status() : 0, html, final_url: page.url() });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`openclaw fetch proxy up on :${PORT}`);
  if (!TOKEN) console.warn('ATTENTION : FETCH_TOKEN non défini, toutes les requêtes seront rejetées (401).');
});
