// sitemap.xml — statický endpoint (output: static → dist/sitemap.xml), bez integrace
// @astrojs/sitemap (žádný npm install). Obsah: 5 typů stránek × 12 jazyků s hreflang
// alternativami, cs/en páry (smazání účtu), české stránky (jména pro psa) a český blog. /join a /admin ne (robots.txt).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE, ALL_LANGS, LOCALIZED_PAGES, pagePath, hreflangSet, CS_EN_PAIRS, CS_ONLY_PAGES } from '../lib/routes';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const alt = (links: { hreflang: string; href: string }[]) =>
  links.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${esc(l.href)}"/>`).join('\n');

export const GET: APIRoute = async () => {
  const urls: string[] = [];

  for (const page of LOCALIZED_PAGES) {
    const links = hreflangSet(page);
    for (const lang of ALL_LANGS) {
      urls.push(`  <url>\n    <loc>${esc(SITE + pagePath(page, lang))}</loc>\n${alt(links)}\n  </url>`);
    }
  }

  for (const [cs, en] of CS_EN_PAIRS) {
    const links = [
      { hreflang: 'cs', href: SITE + cs },
      { hreflang: 'en', href: SITE + en },
      { hreflang: 'x-default', href: SITE + en },
    ];
    for (const p of [cs, en]) urls.push(`  <url>\n    <loc>${esc(SITE + p)}</loc>\n${alt(links)}\n  </url>`);
  }

  // Stránky jen česky (jména pro psa) → bez hreflang.
  for (const p of CS_ONLY_PAGES) urls.push(`  <url>\n    <loc>${esc(SITE + p)}</loc>\n  </url>`);

  // Blog je jen česky → bez hreflang. lastmod = datum článku (jiné spolehlivé nemáme).
  const posts = (await getCollection('blog')).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  urls.push(`  <url>\n    <loc>${SITE}/blog/</loc>\n  </url>`);
  for (const p of posts) {
    urls.push(`  <url>\n    <loc>${esc(`${SITE}/blog/${p.id}/`)}</loc>\n    <lastmod>${p.data.date.toISOString().slice(0, 10)}</lastmod>\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
