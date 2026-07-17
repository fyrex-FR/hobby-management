// Fetch proxy openclaw : charge une URL dans un vrai navigateur headless
// (Chromium/Playwright) et renvoie le HTML rendu. Sert à contourner le blocage
// anti-bot 403 d'eBay depuis une IP datacenter.
//
// Contrat consommé par le backend CardVaults (services/ebay_sold_scraper.py) :
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

// Sortie via un proxy externe (résidentiel/mobile) si FETCH_PROXY_URL est
// défini, ex. http://user:pass@host:port . Indispensable quand l'IP locale
// d'openclaw est elle-même blacklistée par eBay.
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
    browserPromise = chromium.launch({ headless: true, proxy });
  }
  return browserPromise;
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

  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    // Laisse eBay rendre la liste des résultats (best-effort).
    await page.waitForSelector('li.s-item', { timeout: 8000 }).catch(() => {});
    const html = await page.content();
    res.json({ status: resp ? resp.status() : 0, html, final_url: page.url() });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`openclaw fetch proxy up on :${PORT}`);
  if (!TOKEN) console.warn('ATTENTION : FETCH_TOKEN non défini, toutes les requêtes seront rejetées (401).');
});
