import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Élément factice : texte, enfants par sélecteur, listes par sélecteur. */
function node(textContent, children = {}, lists = {}) {
  const self = {
    textContent,
    src: textContent,
    content: textContent,
    querySelector: (selector) => children[selector] ?? null,
    querySelectorAll: (selector) => lists[selector] ?? [],
    cloneNode: () => self,
  };
  return self;
}

function runExtractor(file, fixtures, locationHref, lists = {}) {
  let listener;
  const document = {
    querySelector(selector) {
      const value = fixtures[selector];
      if (!value) return null;
      return typeof value === 'string' ? node(value) : value;
    },
    querySelectorAll: (selector) => lists[selector] ?? [],
  };
  const context = {
    document,
    location: { href: locationHref },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
    Number, Object, String,
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

/** Ligne de détail Vinted : deux cellules sœurs, libellé puis valeur. */
function vintedRow(label, value) {
  return node('', {}, { '.details-list__item-value': [node(label), node(value)] });
}

const VINTED_ROWS = '.details-list__item, [data-testid^=\'item-attributes-\']';
const VINTED_LISTS = {
  [VINTED_ROWS]: [vintedRow('Marque', 'Pokémon'), vintedRow('État', 'Neuf sans étiquette')],
};

const vinted = runExtractor('./scout-vinted.js', {
  h1: { textContent: 'Carte Pokémon Dracaufeu V Gradée 10 Collect Aura - Star Birth (Japonais)' },
  'meta[property="og:title"]': { content: 'Carte Pokémon Dracaufeu V Gradée 10 Collect Aura | Vinted' },
  'meta[property="og:image"]': { content: 'https://images1.vinted.net/card.jpg' },
  "[data-testid='item-price']": { textContent: '12,50 €' },
  "[itemprop='description']": { textContent: 'Certifiée Gem Mint 10 par Collect Aura, carte japonaise numéro 014/100.' },
}, 'https://www.vinted.fr/items/123-card?referrer=catalog', VINTED_LISTS);

assert.equal(vinted.source, 'vinted');
assert.equal(vinted.displayed_price, 12.5);
assert.equal(vinted.source_url, 'https://www.vinted.fr/items/123-card');
assert.equal(vinted.title, 'Carte Pokémon Dracaufeu V Gradée 10 Collect Aura - Star Birth (Japonais)');
assert.ok(!/Vinted/i.test(vinted.title), 'le nom du site ne doit jamais entrer dans la recherche eBay');
assert.equal(vinted.specifics.Marque, 'Pokémon');
assert.equal(vinted.condition, 'Neuf sans étiquette');
assert.match(vinted.description, /014\/100/);

// Sans h1, le titre vient de og:title — dont il faut retirer le suffixe du site.
const vintedMeta = runExtractor('./scout-vinted.js', {
  'meta[property="og:title"]': { content: 'Pashmilla 119/086 ccc 10 Gold label | Vinted' },
  'meta[property="og:image"]': { content: 'https://images1.vinted.net/card.jpg' },
  "[data-testid='item-price']": { textContent: '135,00 €' },
}, 'https://www.vinted.fr/items/456-pashmilla', VINTED_LISTS);
assert.equal(vintedMeta.title, 'Pashmilla 119/086 ccc 10 Gold label');

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

console.log('extractors: 3 fixtures OK');
