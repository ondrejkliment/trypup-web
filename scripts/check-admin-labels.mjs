// Hlídání katalogu popisků akcí (SPEC D.6). Spouští se lokálně, ne při buildu na Vercelu:
//
//   npm run check:labels -- <cesta k pawprint-mobile/src/modules/analytics/events.ts> [<admin-labels.json>]
//
// Bez cesty zkusí proměnnou EVENTS_TS a pak ../pawprint-mobile/src/modules/analytics/events.ts.
// Kontroluje: názvy akcí z events.ts = klíče ev; každá akce má cs, en, g, sb (a od, st, auto, m, p);
// katalog neobsahuje where ani descCs; české texty bez dlouhé pomlčky (U+2014), s nezlomitelnou mezerou
// před větnou pomlčkou, bez emoji, hovorové zkratky slova „aplikace“ a technických slov.
// Při chybě skončí nenulovým kódem. Pravidlo: nová akce v events.ts = řádek v admin-labels.json ve stejném kroku.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const eventsPath = process.argv[2] || process.env.EVENTS_TS || '../pawprint-mobile/src/modules/analytics/events.ts';
const labelsPath = process.argv[3] || resolve(here, '../src/data/admin-labels.json');
if (!existsSync(eventsPath)) {
  console.error(`Nenalezen events.ts: ${eventsPath}\nPoužití: npm run check:labels -- <cesta k events.ts> [<admin-labels.json>]`);
  process.exit(2);
}

let errors = 0;
const fail = (m) => { errors++; console.error('✗ ' + m); };

// --- Názvy akcí z events.ts (blok EVENTS = { … } as const) ---
const src = readFileSync(eventsPath, 'utf8');
const block = src.match(/export const EVENTS\s*=\s*\{([\s\S]*?)\}\s*as const/);
if (!block) { console.error('V events.ts chybí blok „export const EVENTS = { … } as const“.'); process.exit(2); }
const appNames = new Set();
for (const m of block[1].matchAll(/^\s*[A-Z][A-Z0-9_]*\s*:\s*'([^']+)'/gm)) {
  if (appNames.has(m[1])) fail(`events.ts: duplicitní název ${m[1]}`);
  appNames.add(m[1]);
}

// --- Katalog ---
const text = readFileSync(labelsPath, 'utf8');
let L;
try { L = JSON.parse(text); } catch (e) { console.error(`${labelsPath}: neplatný JSON (${e.message})`); process.exit(1); }
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.trim() !== '';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const NAME = /^[a-z][a-z0-9_]{0,59}$/;

if (L.v !== 2) fail(`v = ${JSON.stringify(L.v)}, čekám 2`);
for (const k of ['groups', 'ev', 'screens', 'places']) if (!(k === 'groups' ? Array.isArray(L[k]) : isObj(L[k]))) fail(`chybí nebo má špatný tvar: ${k}`);
if (errors) process.exit(1);

// Popisy a cesty v kódu do katalogu nepatří (u akcí a vlastností to hlídá i výčet povolených polí níže).
if (/"(where|descCs)"\s*:/.test(text)) fail('text katalogu obsahuje klíč where nebo descCs');
for (const k of Object.keys(L)) if (!['v', 'groups', 'ev', 'screens', 'places'].includes(k)) fail(`neznámé pole nejvyšší úrovně: ${k}`);

// Skupiny.
const groups = new Set();
for (const g of L.groups) {
  if (!Array.isArray(g) || g.length !== 3 || !g.every(isStr)) { fail(`groups: špatná položka ${JSON.stringify(g)}`); continue; }
  if (groups.has(g[0])) fail(`groups: duplicitní ${g[0]}`);
  groups.add(g[0]);
}
if (!groups.has('unknown')) fail('groups: chybí „unknown“ (Nezařazené)');

// Místa a obrazovky.
for (const [k, x] of Object.entries(L.places)) if (!Array.isArray(x) || x.length !== 2 || !x.every(isStr)) fail(`places.${k}: čekám [cs, en]`);
for (const [r, x] of Object.entries(L.screens)) {
  if (!Array.isArray(x) || x.length < 3 || x.length > 6 || !isStr(x[0]) || !isStr(x[1])) { fail(`screens.${r}: čekám [cs, en, místo, alias?, sb?, od?]`); continue; }
  if (x[2] !== null && !Object.hasOwn(L.places, x[2])) fail(`screens.${r}: neznámé místo ${x[2]}`);
  if (x.length > 3 && x[3] !== null && !Object.hasOwn(L.screens, x[3])) fail(`screens.${r}: alias ${x[3]} mezi obrazovkami není`);
  if (x.length > 4 && (!Number.isInteger(x[4]) || x[4] <= 0 || !ISO.test(String(x[5])))) fail(`screens.${r}: sb/od musí být verze a ISO den`);
}

// Akce.
const MODES = new Set(['none', 'both', 'trial', 'owner']);
const STATES = new Set(['live', 'removed', 'testers']);
const EV_KEYS = new Set(['g', 'cs', 'en', 'sb', 'od', 'st', 'auto', 'm', 'p']);
const P_KEYS = new Set(['cs', 'en', 'v', 'f', 'ref', 'sb', 'od']);
for (const [n, e] of Object.entries(L.ev)) {
  if (!NAME.test(n)) fail(`ev.${n}: název neodpovídá vzoru ${NAME}`);
  if (!isObj(e)) { fail(`ev.${n}: čekám objekt`); continue; }
  for (const k of Object.keys(e)) if (!EV_KEYS.has(k)) fail(`ev.${n}: neznámé pole ${k}`);
  if (!isStr(e.cs)) fail(`ev.${n}: chybí cs`);
  if (!isStr(e.en)) fail(`ev.${n}: chybí en`);
  if (!groups.has(e.g) || e.g === 'unknown') fail(`ev.${n}: neplatná skupina g = ${JSON.stringify(e.g)}`);
  if (!STATES.has(e.st)) fail(`ev.${n}: st musí být live | removed | testers`);
  if (!Number.isInteger(e.sb) || e.sb < 0 || (e.sb === 0 && e.st !== 'removed')) fail(`ev.${n}: chybí sb (číslo verze; 0 jen u st removed)`);
  if (!(ISO.test(String(e.od)) || (e.od === null && e.st === 'removed'))) fail(`ev.${n}: od musí být ISO den (null jen u st removed)`);
  if (e.auto !== 0 && e.auto !== 1) fail(`ev.${n}: auto musí být 0 nebo 1`);
  if (!MODES.has(e.m)) fail(`ev.${n}: m musí být none | both | trial | owner`);
  if (!isObj(e.p)) { fail(`ev.${n}: chybí p`); continue; }
  for (const [k, p] of Object.entries(e.p)) {
    const id = `ev.${n}.p.${k}`;
    if (!isObj(p)) { fail(`${id}: čekám objekt`); continue; }
    for (const pk of Object.keys(p)) if (!P_KEYS.has(pk)) fail(`${id}: neznámé pole ${pk}`);
    if (!isStr(p.cs) || !isStr(p.en)) fail(`${id}: chybí cs nebo en`);
    if (p.f !== undefined && p.f !== 1) fail(`${id}: f musí být 1`);
    if (p.ref !== undefined && p.ref !== 'screens') fail(`${id}: ref musí být "screens"`);
    if ((p.sb !== undefined || p.od !== undefined) && (!Number.isInteger(p.sb) || p.sb <= 0 || !ISO.test(String(p.od)))) fail(`${id}: sb/od musí být verze a ISO den`);
    if (p.v !== undefined) {
      if (!isObj(p.v)) { fail(`${id}.v: čekám objekt`); continue; }
      for (const [vk, x] of Object.entries(p.v)) {
        if (!Array.isArray(x) || !(x.length === 2 || x.length === 4) || !isStr(x[0]) || !isStr(x[1])) fail(`${id}.v.${JSON.stringify(vk)}: čekám [cs, en] nebo [cs, en, sb, od]`);
        else if (x.length === 4 && (!Number.isInteger(x[2]) || x[2] <= 0 || !ISO.test(String(x[3])))) fail(`${id}.v.${JSON.stringify(vk)}: sb/od musí být verze a ISO den`);
      }
    }
  }
}

// Shoda s aplikací.
const catNames = new Set(Object.keys(L.ev));
const missing = [...appNames].filter((n) => !catNames.has(n));
const extra = [...catNames].filter((n) => !appNames.has(n) && L.ev[n].st !== 'removed');
for (const n of missing) fail(`akce ${n} je v events.ts, v katalogu chybí (doplň řádek do admin-labels.json)`);
for (const n of extra) fail(`akce ${n} je v katalogu, v events.ts není (smaž ji nebo nastav st: "removed")`);

// České texty.
const cs = [];
const pushCs = (where, s) => cs.push([where, String(s)]);
L.groups.forEach((g) => pushCs(`groups.${g[0]}`, g[1]));
for (const [k, x] of Object.entries(L.places)) pushCs(`places.${k}`, x[0]);
for (const [r, x] of Object.entries(L.screens)) pushCs(`screens.${r}`, x[0]);
for (const [n, e] of Object.entries(L.ev)) {
  pushCs(`ev.${n}`, e.cs);
  for (const [k, p] of Object.entries(e.p)) {
    pushCs(`ev.${n}.${k}`, p.cs);
    for (const [vk, x] of Object.entries(p.v || {})) pushCs(`ev.${n}.${k}=${vk}`, x[0]);
  }
}
const RULES = [
  [/—/, 'dlouhá pomlčka (U+2014)'],
  [/(?<! )–\s/u, 'větná pomlčka bez nezlomitelné mezery před ní'],
  [/\d\s*–\s+\d|\d\s+–\s*\d/u, 'rozsah s mezerami (piš 3–4)'],
  [/\p{Extended_Pictographic}/u, 'emoji'],
  [/(?<![\p{L}\p{N}])ap?pk[aouyěi]/iu, 'hovorová zkratka slova „aplikace“'],
  [/(?<![\p{L}\p{N}])(build|event|props|installId|referrer|utm_|dashboard|funnel|drill log|ledger)/iu, 'technické slovo'],
];
for (const [where, s] of cs) for (const [re, why] of RULES) if (re.test(s)) fail(`${where}: ${why}: ${JSON.stringify(s)}`);

console.log(`Akce: aplikace ${appNames.size} = katalog ${catNames.size}` + (L.ev && Object.values(L.ev).some((e) => e.st === 'removed') ? ` (ukončené: ${Object.entries(L.ev).filter(([, e]) => e.st === 'removed').map(([n]) => n).join(', ')})` : ''));
console.log(`Obrazovek ${Object.keys(L.screens).length} · míst ${Object.keys(L.places).length} · skupin ${L.groups.length} · českých textů ${cs.length}`);
if (errors) { console.error(`\n${errors} chyb.`); process.exit(1); }
console.log('Katalog v pořádku.');
