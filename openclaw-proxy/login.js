// Connexion au compte eBay dans le profil du proxy (à faire une fois, puis
// quand la session expire). Ouvre une vraie fenêtre sur la page de connexion
// eBay avec le MÊME profil que le serveur : tu te connectes toi-même, puis tu
// fermes la fenêtre. La session reste enregistrée dans USER_DATA_DIR.
//
//   USER_DATA_DIR=... CHROMIUM_EXECUTABLE=... npm run login
//
// Arrête le serveur avant (un profil Chromium ne s'ouvre qu'une fois à la fois).

import { chromium } from 'playwright';

const USER_DATA_DIR = process.env.USER_DATA_DIR;
const CHROMIUM_EXECUTABLE = process.env.CHROMIUM_EXECUTABLE || '';
if (!USER_DATA_DIR) {
  console.error('USER_DATA_DIR est obligatoire : le même dossier que celui du serveur.');
  process.exit(1);
}

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  ...(CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {}),
  args: ['--disable-blink-features=AutomationControlled'],
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
  viewport: null,
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://signin.ebay.fr/', { waitUntil: 'domcontentloaded' }).catch(() => {});
console.log('Connecte-toi à eBay dans la fenêtre ouverte, puis ferme-la pour enregistrer la session.');
await new Promise((resolve) => context.on('close', resolve));
console.log('Session enregistrée. Relance le serveur (npm start).');
