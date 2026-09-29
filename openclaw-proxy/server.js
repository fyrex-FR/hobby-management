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
const USER_DATA_DIR = process.env.USER_DATA_DIR || '';
const CHROMIUM_EXECUTABLE = process.env.CHROMIUM_EXECUTABLE || '';
// eBay bloque désormais le mode headless (403 « Error Page ») quelles que soient
// les en-têtes : HEADLESS=false lance une vraie fenêtre (hors écran sur un Mac,
// ou dans un écran virtuel Xvfb sur un serveur Linux : `xvfb-run npm start`).
const HEADLESS = process.env.HEADLESS !== 'false';
const NAV_TIMEOUT = 30000;
const SIGNIN_RE = /signin\.ebay\.|\/signin\//i;

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

/**
 * User-agent et Client Hints d'un Chrome de bureau de la même version que le
 * binaire lancé (un décalage de version est lui-même un signal de robot).
 */
async function browserIdentity() {
  const probe = await chromium.launch({ headless: true, ...(CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {}) });
  const major = probe.version().split('.')[0];
  await probe.close();
  const mac = process.platform === 'darwin';
  return {
    userAgent: mac
      ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
      : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
    clientHints: {
      'sec-ch-ua': `"Chromium";v="${major}", "Google Chrome";v="${major}", "Not-A.Brand";v="99"`,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': mac ? '"macOS"' : '"Linux"',
    },
  };
}

let ctxPromise = null;
async function getContext() {
  if (!ctxPromise) {
    const proxy = proxyFromEnv();
    if (proxy) console.log(`sortie via proxy ${proxy.server}`);
    ctxPromise = (async () => {
      // En vraie fenêtre, Chrome envoie déjà sa vraie identité : la surcharger
      // crée des incohérences (ordre des marques, version) que eBay détecte.
      const identity = HEADLESS ? await browserIdentity() : null;
      const launchOptions = {
        headless: HEADLESS,
        proxy,
        ...(CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {}),
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          // Fenêtre réelle mais hors écran quand HEADLESS=false.
          ...(HEADLESS ? [] : ['--window-position=-2400,-2400']),
        ],
      };
      // En headless, les deux modes (profil persistant ou non) reçoivent la
      // même identité : avant, le profil persistant s'annonçait « HeadlessChrome ».
      const contextOptions = {
        ...(identity ? { userAgent: identity.userAgent, extraHTTPHeaders: identity.clientHints } : {}),
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1280, height: 900 },
      };
      const context = USER_DATA_DIR
        ? await chromium.launchPersistentContext(USER_DATA_DIR, { ...launchOptions, ...contextOptions })
        : await chromium.launch(launchOptions).then((browser) => browser.newContext(contextOptions));
      // Masque les signaux d'automatisation les plus évidents.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      });
      // Chauffe la session : visite la home eBay pour obtenir des cookies avant
      // de taper les pages de recherche (best-effort).
      try {
        const p = await context.newPage();
        await p.goto('https://www.ebay.fr/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
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

app.get('/session', async (req, res) => {
  if (!TOKEN || req.get('X-Auth-Token') !== TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const context = await getContext();
    const cookies = await context.cookies('https://www.ebay.fr/');
    res.json({ persistent: Boolean(USER_DATA_DIR), headless: HEADLESS, ebay_cookie_count: cookies.length });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
});

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
    // Code HTTP de la DERNIÈRE navigation de la page (après redirections ou
    // page de vérification), pas de la première réponse.
    let lastStatus = 0;
    page.on('response', (r) => {
      if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) lastStatus = r.status();
    });
    // `domcontentloaded` peut ne jamais arriver sur les pages eBay connectées
    // (scripts/long-polling). On valide la navigation dès le premier octet,
    // puis on attend les résultats avec des bornes indépendantes.
    await page.goto(url, { waitUntil: 'commit', timeout: NAV_TIMEOUT });
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    // Laisse eBay rendre la liste des résultats (best-effort) ; couvre aussi
    // une page de vérification qui se résout seule en quelques secondes.
    await page.waitForSelector('li.s-item, li.s-card', { timeout: 12000 }).catch(() => {});
    const finalUrl = page.url();
    // eBay exige d'être connecté pour les ventes terminées : il redirige vers
    // la page de connexion. Signalé explicitement au backend.
    if (SIGNIN_RE.test(finalUrl)) {
      return res.json({ status: 401, login_required: true, html: '', final_url: finalUrl });
    }
    const html = await page.content();
    res.json({ status: lastStatus, html, final_url: finalUrl });
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
