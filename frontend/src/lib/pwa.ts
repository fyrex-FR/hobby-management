/**
 * Deux apps installables depuis le même site :
 * - « Scan » (manifest.webmanifest, ouvre /#/scan en plein écran sans menu) ;
 * - « CardVaults » (app.webmanifest, l'app complète).
 * Le téléphone installe celle qui correspond à la page en cours : on aligne
 * manifest, icône et titre iOS sur la vue affichée. Le script de index.html
 * fait la même chose avant le premier rendu et retient le mode de lancement.
 */
const TARGETS = {
  scan: { manifest: '/manifest.webmanifest', icon: '/apple-touch-icon.png', title: 'Scan' },
  main: { manifest: '/app.webmanifest', icon: '/app-apple-touch-icon.png', title: 'CardVaults' },
} as const;

export function syncInstallTarget(isScanView: boolean) {
  const t = TARGETS[isScanView ? 'scan' : 'main'];
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', t.manifest);
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', t.icon);
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', t.title);
}

/** Lancée depuis l'icône « Scan » (et pas depuis l'app complète) : scanner sans menu. */
export function launchedAsScan(): boolean {
  try {
    return sessionStorage.getItem('cv-launch-mode') === 'scan';
  } catch {
    return false;
  }
}
