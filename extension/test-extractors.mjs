import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Élément factice : `textContent` plus les enfants adressés par sélecteur. */
function node(textContent, children = {}) {
  return {
    textContent,
    src: textContent,
    content: textContent,
    querySelector(selector) {
      return children[selector] ?? null;
    },
  };
}

function runExtractor(file, fixtures, locationHref, lists = {}) {
  let listener;
  const document = {
    querySelector(selector) {
      const value = fixtures[selector];
      if (!value) return null;
      return typeof value === 'string' ? node(value) : value;
    },
    querySelectorAll(selector) {
      return lists[selector] ?? [];
    },
  };
  const context = {
    document,
    location: { href: locationHref },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
    Number,
  };
  vm.runInNewContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context);
  let result;
  listener({ type: 'SCOUT_EXTRACT_LISTING' }, {}, (value) => { result = value; });
  return result;
}

/** Ligne « libellé / valeur » du bloc Caractéristiques de l'objet eBay. */
function ebayRow(label, value) {
  return node('', {
    '.ux-labels-values__labels': node(label),
    '.ux-labels-values__values': node(value),
  });
}

/** Ligne de détail Vinted (Marque, État…). */
function vintedRow(label, value) {
  return node('', {
    "[class*='title'], .web_ui__Cell__title": node(label),
    "[class*='subtitle'], .web_ui__Cell__subtitle": node(value),
  });
}

const vinted = runExtractor('./scout-vinted.js', {
  'meta[property="og:title"]': { content: 'Victor Wembanyama Rookie Prizm' },
  'meta[property="og:image"]': { content: 'https://images1.vinted.net/card.jpg' },
  "[data-testid='item-price']": { textContent: '12,50 €' },
}, 'https://www.vinted.fr/items/123-card?referrer=catalog', {
  "[data-testid$='--content-row'], .details-list__item-value": [
    vintedRow('Marque', 'Panini'),
    vintedRow('État :', 'Neuf avec étiquette'),
  ],
});
assert.equal(vinted.source, 'vinted');
assert.equal(vinted.displayed_price, 12.5);
assert.equal(vinted.currency, 'EUR');
assert.equal(vinted.source_url, 'https://www.vinted.fr/items/123-card');
assert.equal(vinted.specifics.Marque, 'Panini');
assert.equal(vinted.condition, 'Neuf avec étiquette');

const ebay = runExtractor('./scout-ebay.js', {
  'h1.x-item-title__mainTitle': { textContent: '2023 Topps Wembanyama #1' },
  '.x-price-primary': { textContent: 'EUR 21,99' },
  '.ux-image-carousel-item.active img, .ux-image-carousel img, #icImg': { src: 'https://i.ebayimg.com/card.jpg' },
  '.x-item-condition-value .ux-textspans': { textContent: '  Non gradée -\n Quasi neuf ou mieux ' },
}, 'https://www.ebay.fr/itm/456?hash=abc', {
  '.ux-labels-values': [
    ebayRow('Joueur', 'Victor Wembanyama'),
    ebayRow('Professionnel noté :', 'Non'),
    ebayRow('Saison', '2023-24'),
    ebayRow('Vide', ''),
  ],
});
assert.equal(ebay.source, 'ebay');
assert.equal(ebay.displayed_price, 21.99);
assert.equal(ebay.currency, 'EUR');
assert.equal(ebay.source_url, 'https://www.ebay.fr/itm/456');
assert.equal(ebay.condition, 'Non gradée - Quasi neuf ou mieux');
assert.equal(ebay.specifics['Professionnel noté'], 'Non');
assert.equal(ebay.specifics.Joueur, 'Victor Wembanyama');
assert.ok(!('Vide' in ebay.specifics), 'une caractéristique sans valeur est ignorée');

console.log('extractors: 2 fixtures OK');
