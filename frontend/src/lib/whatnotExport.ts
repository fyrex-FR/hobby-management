import type { Card } from '../types';

/**
 * Export CSV « Quick Add » Whatnot.
 *
 * Le format (colonnes, ordre, valeurs autorisées) vient du modèle officiel
 * FR_Whatnot_quick_add_CSV_format.xlsx : 21 colonnes, et des listes de valeurs
 * fermées pour Catégorie / Sous-catégorie / Type / Profil de livraison /
 * Matières dangereuses / État. Toute valeur hors liste fait rejeter la ligne à
 * l'import, d'où les constantes ci-dessous plutôt que du texte libre.
 */

/** En-têtes exacts du modèle, dans l'ordre (l'import est positionnel). */
export const WHATNOT_HEADERS = [
  'Catégorie',
  'Sous-catégorie',
  'Titre',
  'Description',
  'Quantité',
  'Type',
  'Prix',
  'Profil de livraison',
  'Offres Acceptées',
  'Matières dangereuses',
  'État',
  'Coût par article',
  'SKU',
  'Image URL 1',
  'Image URL 2',
  'Image URL 3',
  'Image URL 4',
  'Image URL 5',
  'Image URL 6',
  'Image URL 7',
  'Image URL 8',
] as const;

export const WHATNOT_CATEGORY = 'Cartes de Sport';

/** Sous-catégories de « Cartes de Sport » pour des cartes à l'unité. */
export const WHATNOT_SUBCATEGORIES = [
  "Cartes à l'unité basketball",
  "Cartes à l'unité football américain",
  "Cartes à l'unité baseball",
  "Cartes à l'unité hockey",
  "Cartes à l'unité de football",
  "Cartes à l'unité catch",
  "Cartes à l'unité UFC",
  'Cartes F1',
  'Cartes NASCAR',
  'Autres cartes de sport',
] as const;

/** États valides pour les sous-catégories « cartes à l'unité ». */
export const WHATNOT_CONDITIONS = [
  'Raw - Near Mint or Better',
  'Raw - Excellent',
  'Raw - Very Good',
  'Raw - Poor',
  'Graded',
] as const;

export const WHATNOT_TYPES = ['Buy it Now', 'Auction', 'Giveaway'] as const;

/** Profils de livraison du modèle (sous-ensemble pertinent pour des cartes).
 *
 * ATTENTION : dans le modèle Whatnot ces libellés contiennent des espaces
 * INSÉCABLES (U+00A0) avant les unités : `3`, U+00A0, `oz` — et non une
 * espace ordinaire. Une espace normale ne correspond alors à aucune valeur de
 * la liste et fait rejeter la ligne à l'import, d'où les échappements
 * explicites `\u00A0` ci-dessous (invisibles autrement, donc faciles à
 * casser lors d'une édition). */
export const WHATNOT_SHIPPING_PROFILES = [
  "Sports à l'unité (3\u00A0oz, 85\u00A0g)",
  'De 0\u00A0oz à 1\u00A0oz',
  'De 1\u00A0oz à 3\u00A0oz',
  'De 4\u00A0oz à 7\u00A0oz',
  'De 8\u00A0oz à 11\u00A0oz',
  'De 0 à <20\u00A0grammes',
  'De 20\u00A0g à <100\u00A0g',
  'De 100\u00A0g à <250\u00A0g',
] as const;

export type WhatnotSubcategory = (typeof WHATNOT_SUBCATEGORIES)[number];
export type WhatnotCondition = (typeof WHATNOT_CONDITIONS)[number];
export type WhatnotType = (typeof WHATNOT_TYPES)[number];
export type WhatnotShippingProfile = (typeof WHATNOT_SHIPPING_PROFILES)[number];

export interface WhatnotExportOptions {
  subcategory: WhatnotSubcategory;
  type: WhatnotType;
  shippingProfile: WhatnotShippingProfile;
  /** État des cartes non gradées (les gradées passent d'office en « Graded »). */
  rawCondition: WhatnotCondition;
  acceptOffers: boolean;
  /** Inclut `purchase_price` en « Coût par article » (suivi de marge Whatnot). */
  includeCost: boolean;
}

/** Défauts orientés cartes de basket à l'unité. Les libellés référencent les
 * constantes ci-dessus plutôt que d'être retapés, pour ne pas réintroduire une
 * espace normale là où Whatnot attend une insécable. */
export const WHATNOT_DEFAULTS: WhatnotExportOptions = {
  subcategory: WHATNOT_SUBCATEGORIES[0],
  type: WHATNOT_TYPES[0],
  shippingProfile: WHATNOT_SHIPPING_PROFILES[0],
  rawCondition: WHATNOT_CONDITIONS[0],
  acceptOffers: false,
  includeCost: true,
};

const TITLE_MAX_LEN = 100;

/** Titre lisible à partir des attributs de la carte (même construction que le
 * titre d'annonce eBay : année, marque, set, joueur, insert, parallèle, n°,
 * tirage, RC, gradation). */
export function buildWhatnotTitle(card: Card): string {
  const grading = card.grading_company && card.grading_grade
    ? `${card.grading_company} ${card.grading_grade}`
    : null;

  let cardNumber = card.card_number?.trim() || null;
  if (cardNumber && !cardNumber.startsWith('#')) cardNumber = `#${cardNumber}`;

  // Le set n'est ajouté que s'il apporte une info nouvelle : avec
  // brand="Panini Prizm" et set_name="Prizm", un simple test d'inégalité
  // produirait « Panini Prizm Prizm ».
  const brand = card.brand?.trim() || null;
  const setName = card.set_name?.trim() || null;
  const redundantSet = Boolean(
    brand && setName && brand.toLowerCase().includes(setName.toLowerCase()),
  );

  const parts = [
    card.year,
    brand || setName,
    brand && setName && !redundantSet ? setName : null,
    card.player,
    card.insert_name,
    card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : null,
    cardNumber,
    card.numbered,
    card.is_rookie ? 'RC' : null,
    grading,
  ].filter(Boolean) as string[];

  const title = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (title.length <= TITLE_MAX_LEN) return title;
  const cut = title.slice(0, TITLE_MAX_LEN).replace(/\s+\S*$/, '');
  return cut || title.slice(0, TITLE_MAX_LEN);
}

/** Description : attributs structurés + notes d'état éventuelles. */
export function buildWhatnotDescription(card: Card): string {
  const lines: string[] = [];
  const attr = (label: string, value: unknown) => {
    if (value) lines.push(`${label} : ${value}`);
  };
  attr('Joueur', card.player);
  attr('Équipe', card.team);
  attr('Année', card.year);
  attr('Marque', card.brand);
  attr('Set', card.set_name);
  attr('Insert', card.insert_name);
  if (card.parallel_name && card.parallel_name !== 'Base') attr('Parallèle', card.parallel_name);
  attr('N° de carte', card.card_number);
  attr('Tirage', card.numbered);
  if (card.is_rookie) lines.push('Rookie Card');
  if (card.grading_company && card.grading_grade) {
    lines.push(`Gradée ${card.grading_company} ${card.grading_grade}${card.grading_cert ? ` (cert. ${card.grading_cert})` : ''}`);
  }
  if (card.condition_notes) lines.push(`État : ${card.condition_notes}`);
  lines.push('Carte protégée en toploader/sleeve, envoi soigné.');
  return lines.join('\n');
}

export function whatnotCondition(card: Card, rawCondition: WhatnotCondition): WhatnotCondition {
  return card.grading_company && card.grading_grade ? 'Graded' : rawCondition;
}

/** Une carte est exportable si elle a un prix et au moins une photo (Whatnot
 * exige des URL d'images publiques). */
export function isWhatnotExportable(card: Card): boolean {
  return (card.price ?? 0) > 0 && Boolean(card.image_front_url);
}

function escapeCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Construit la ligne CSV d'une carte, alignée sur WHATNOT_HEADERS. */
export function buildWhatnotRow(card: Card, opts: WhatnotExportOptions): string[] {
  // Whatnot télécharge les images depuis ces URL : il faut les URL publiques
  // R2 telles quelles (surtout pas le proxy same-origin /cdn/ de cdnImg).
  const images = [card.image_front_url, card.image_back_url].filter(Boolean) as string[];
  const imageCells = Array.from({ length: 8 }, (_, i) => images[i] ?? '');

  return [
    WHATNOT_CATEGORY,
    opts.subcategory,
    buildWhatnotTitle(card),
    buildWhatnotDescription(card),
    String(Math.max(1, card.quantity ?? 1)),
    opts.type,
    String(card.price ?? ''),
    opts.shippingProfile,
    opts.acceptOffers ? 'TRUE' : '',
    'Not Hazmat',
    whatnotCondition(card, opts.rawCondition),
    opts.includeCost && card.purchase_price != null ? String(card.purchase_price) : '',
    card.id,
    ...imageCells,
  ];
}

export function buildWhatnotCsv(cards: Card[], opts: WhatnotExportOptions): string {
  const header = WHATNOT_HEADERS.map(escapeCell).join(',');
  const rows = cards.map((card) => buildWhatnotRow(card, opts).map(escapeCell).join(','));
  return [header, ...rows].join('\n');
}

/** Déclenche le téléchargement du CSV (BOM UTF-8 pour les accents dans Excel). */
export function downloadWhatnotCsv(cards: Card[], opts: WhatnotExportOptions): void {
  const csv = buildWhatnotCsv(cards, opts);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whatnot_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
