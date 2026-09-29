/**
 * Aperçu des liens de partage (Open Graph) pour WhatsApp, Instagram, Discord,
 * iMessage, X… Ces robots ne lancent pas le JavaScript de l'app : on injecte
 * titre, description et image dans le <head> de la page, uniquement pour eux.
 * Les visiteurs reçoivent la page telle quelle.
 */

interface Env {
  API_URL?: string;
}

interface ShareCard {
  image_front_url?: string | null;
  card_type?: string | null;
  grading_company?: string | null;
  numbered?: string | null;
  is_rookie?: boolean | null;
}

interface ShareView {
  title?: string | null;
  filter?: string;
  card_count?: number;
  cards?: ShareCard[];
}

interface Meta {
  title: string;
  description: string;
  image: string | null;
}

const DEFAULT_API = 'https://collection-api.cardvaults.app';
const PREVIEW_BOTS = /bot|crawler|spider|facebookexternalhit|facebookcatalog|whatsapp|telegram|slack|discord|twitter|linkedin|pinterest|embedly|preview|skype|vkshare|redditbot|applebot|snapchat|instagram|google/i;
const FILTER_LABELS: Record<string, string> = { all: 'Collection', collection: 'Collection', a_vendre: 'Cartes à vendre' };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function numberedValue(n: string | null | undefined): number {
  const m = n?.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/** Même logique que la couverture de la page : autos, gradées, petits tirages d'abord. */
function coverImage(cards: ShareCard[]): string | null {
  const score = (c: ShareCard) =>
    (c.card_type === 'auto' || c.card_type === 'auto_patch' ? 4 : 0) +
    (c.grading_company ? 2 : 0) +
    (c.numbered ? (numberedValue(c.numbered) <= 25 ? 4 : numberedValue(c.numbered) <= 99 ? 2 : 1) : 0) +
    (c.is_rookie ? 1 : 0);
  const best = cards.filter((c) => c.image_front_url).sort((a, b) => score(b) - score(a))[0];
  return best?.image_front_url ?? null;
}

function buildMeta(view: ShareView): Meta {
  const cards = view.cards ?? [];
  const count = view.card_count ?? cards.length;
  const rookies = cards.filter((c) => c.is_rookie).length;
  const autos = cards.filter((c) => c.card_type === 'auto' || c.card_type === 'auto_patch').length;
  const numbered = cards.filter((c) => c.numbered).length;
  const parts = [`${count} carte${count > 1 ? 's' : ''}`];
  if (rookies) parts.push(`${rookies} rookie${rookies > 1 ? 's' : ''}`);
  if (autos) parts.push(`${autos} auto${autos > 1 ? 's' : ''}`);
  if (numbered) parts.push(`${numbered} numérotée${numbered > 1 ? 's' : ''}`);
  const title = view.title?.trim() || FILTER_LABELS[view.filter ?? 'all'] || 'Collection';
  return {
    title: `${title} · CardVaults`,
    description: `${parts.join(' · ')}. Parcours la collection et envoie ta sélection au collectionneur.`,
    image: coverImage(cards),
  };
}

async function loadMeta(token: string, env: Env, waitUntil: (p: Promise<unknown>) => void): Promise<Meta | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://og-cache.cardvaults.internal/share/${encodeURIComponent(token)}`);
  const hit = await cache.match(key);
  if (hit) return hit.json<Meta>();

  const api = (env.API_URL || DEFAULT_API).replace(/\/$/, '');
  const resp = await fetch(`${api}/api/share/${encodeURIComponent(token)}/view`);
  if (!resp.ok) return null;
  const meta = buildMeta(await resp.json<ShareView>());
  waitUntil(cache.put(key, new Response(JSON.stringify(meta), { headers: { 'Cache-Control': 'max-age=3600' } })));
  return meta;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const page = await context.next();
  const ua = context.request.headers.get('user-agent') ?? '';
  if (!PREVIEW_BOTS.test(ua) || !page.headers.get('content-type')?.includes('text/html')) return page;

  const token = String(context.params.token ?? '');
  let meta: Meta | null = null;
  try {
    meta = await loadMeta(token, context.env, (p) => context.waitUntil(p));
  } catch {
    return page; // l'aperçu est un bonus : ne jamais casser la page
  }
  if (!meta) return page;

  const url = new URL(context.request.url);
  url.search = '';
  const tags = [
    `<meta name="description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="CardVaults">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:url" content="${escapeHtml(url.toString())}">`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}">` : '',
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}">` : '',
  ].filter(Boolean).join('\n    ');

  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(meta!.title); } })
    .on('head', { element(el) { el.append(`\n    ${tags}\n`, { html: true }); } })
    .transform(page);
};
