import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runExtractor(file, fixtures, locationHref) {
  let listener;
  const document = {
    querySelector(selector) {
      const value = fixtures[selector];
      if (!value) return null;
      return typeof value === 'string' ? { textContent: value, src: value, content: value } : value;
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

const vinted = runExtractor('./scout-vinted.js', {
  'meta[property="og:title"]': { content: 'Victor Wembanyama Rookie Prizm' },
  'meta[property="og:image"]': { content: 'https://images1.vinted.net/card.jpg' },
  "[data-testid='item-price']": { textContent: '12,50 €' },
}, 'https://www.vinted.fr/items/123-card?referrer=catalog');
assert.equal(vinted.source, 'vinted');
assert.equal(vinted.displayed_price, 12.5);
assert.equal(vinted.source_url, 'https://www.vinted.fr/items/123-card');

const ebay = runExtractor('./scout-ebay.js', {
  'h1.x-item-title__mainTitle': { textContent: '2023 Topps Wembanyama #1' },
  '.x-price-primary': { textContent: 'EUR 21,99' },
  '.ux-image-carousel-item.active img, .ux-image-carousel img, #icImg': { src: 'https://i.ebayimg.com/card.jpg' },
}, 'https://www.ebay.fr/itm/456?hash=abc');
assert.equal(ebay.source, 'ebay');
assert.equal(ebay.displayed_price, 21.99);
assert.equal(ebay.source_url, 'https://www.ebay.fr/itm/456');

console.log('extractors: 2 fixtures OK');
