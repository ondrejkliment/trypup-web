// Kontrola po `astro build` (spouštět: npm run build && npm run check:site).
// 1) Výchozí texty CMS (src/lib/siteContent.ts) = statický text stránek 1:1
//    (jinak by editor /admin/content nabízel jiný text, než je na webu).
// 2) Každá <loc> v sitemap.xml existuje v dist/.
// 3) hreflang je oboustranný (stránka A odkazuje na B ⇒ B odkazuje na A).
import { readFileSync, existsSync } from 'node:fs';

const SITE = 'https://trypup.life';
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const fileFor = (url) => `dist${new URL(url).pathname}index.html`;
let errors = 0;
const fail = (m) => { errors++; console.error('✗ ' + m); };

// 1) CMS
const src = readFileSync('src/lib/siteContent.ts', 'utf8');
const defaults = {};
for (const m of src.matchAll(/key: '([^']+)'.*?default: '((?:[^'\\]|\\.)*)' \}/g)) defaults[m[1]] = m[2].replace(/\\'/g, "'");
const seen = new Set();
for (const f of ['dist/index.html', 'dist/en/index.html', 'dist/o-aplikaci/index.html', 'dist/en/about/index.html']) {
  const h = readFileSync(f, 'utf8');
  for (const m of h.matchAll(/<(\w+)[^>]*data-cms="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = unescape(m[3].replace(/<[^>]+>/g, '')).trim();
    seen.add(m[2]);
    if (!(m[2] in defaults)) fail(`CMS: ${m[2]} nemá záznam v CMS_FIELDS (${f})`);
    else if (defaults[m[2]] !== text) fail(`CMS: ${m[2]}\n    stránka: ${text}\n    výchozí: ${defaults[m[2]]}`);
  }
}
for (const k of Object.keys(defaults)) if (!seen.has(k) && !k.startsWith('common.social.')) fail(`CMS: ${k} se na žádné stránce nepoužívá`);

// 2) sitemap
const sm = readFileSync('dist/sitemap.xml', 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => unescape(m[1]));
for (const l of locs) if (!existsSync(fileFor(l))) fail(`sitemap: ${l} v dist/ neexistuje`);

// 3) hreflang reciprocita
const hl = (f) => [...readFileSync(f, 'utf8').matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => ({ lang: m[1], href: m[2] }));
for (const l of locs) {
  const self = hl(fileFor(l));
  for (const a of self) {
    if (a.lang === 'x-default') continue;
    if (!existsSync(fileFor(a.href))) { fail(`hreflang: ${l} → ${a.href} neexistuje`); continue; }
    if (!hl(fileFor(a.href)).some((b) => b.href === l)) fail(`hreflang: ${a.href} neodkazuje zpět na ${l}`);
  }
}
console.log(errors ? `\n${errors} chyb` : `OK — CMS ${seen.size} polí, sitemap ${locs.length} URL, hreflang oboustranný`);
process.exit(errors ? 1 : 0);
