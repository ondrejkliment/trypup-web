#!/usr/bin/env node
// Kontrola výpočetního jádra adminu (SPEC G.2). Spouští se lokálně, ne při buildu.
//
//   node scripts/check-admin-core.mjs <demo.json> <ref.json> [--campaigns <ad_campaigns.json> <ref-campaigns.json>]
//                                     [--out <složka>]
//
// Vyřízne z src/pages/admin.astro blok klasifikace (ADMIN CLASSIFY) a jádra (ADMIN CORE), spustí je
// v node:vm nad výpisem dat a katalogem src/data/admin-labels.json („teď“ = meta.dumpedAt) a porovná
// rekurzivně každý klíč s nezávislým výpočtem (scripts/admin-reference.py). Počty musí sedět přesně;
// desetinná čísla (z, perDay, above, cost, spendEur) s tolerancí jedné jednotky posledního místa.
// meta.* je informační a neporovnává se. Navíc změří buildIndex (cíl pod 100 ms nad 30 dny).
// Výpis zařízení ani reference se nikdy necommitují; --out uloží výstup jádra (jen do scratchpadu).
// Konec: 0 = bez rozdílu, 1 = rozdíl nebo pomalý index, 2 = špatné vstupy.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = path.join(ROOT, 'src/pages/admin.astro');
const CATALOG = path.join(ROOT, 'src/data/admin-labels.json');
const INDEX_LIMIT_MS = 100;

function usage(msg) {
  console.error(msg);
  console.error('Použití: node scripts/check-admin-core.mjs <demo.json> <ref.json> [--campaigns <ad_campaigns.json> <ref-campaigns.json>] [--out <složka>]');
  process.exit(2);
}
const args = process.argv.slice(2);
const pos = [], opt = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--campaigns') { opt.campaigns = [args[i + 1], args[i + 2]]; i += 2; }
  else if (args[i] === '--out') { opt.out = args[i + 1]; i += 1; }
  else pos.push(args[i]);
}
if (pos.length !== 2) usage('Chybí výpis nebo reference.');
if (opt.campaigns && opt.campaigns.some((x) => !x)) usage('--campaigns potřebuje dva soubory.');
const readJson = (p, what) => {
  try { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); }
  catch (e) { usage(`Nejde přečíst ${what} (${p}): ${e.message}`); }
};
const dump = readJson(pos[0], 'výpis');
const ref = readJson(pos[1], 'referenci');
const catalog = readJson(CATALOG, 'katalog');

// ── Vyříznutí bloků z admin.astro
const src = fs.readFileSync(ADMIN, 'utf8');
function block(name) {
  const a = src.indexOf(`// == ${name} START ==`), b = src.indexOf(`// == ${name} END ==`);
  if (a < 0 || b < 0 || b < a) usage(`V admin.astro chybí značky ${name}.`);
  if (src.indexOf(`// == ${name} START ==`, a + 1) >= 0) usage(`Značka ${name} je v admin.astro víckrát.`);
  return src.slice(a, b);
}
const classifyCode = block('ADMIN CLASSIFY');
const coreCode = block('ADMIN CORE');
// Jádro nesmí sahat na DOM, Firebase ani window (C.5).
const forbidden = /(?<![\w.'"])(document|window|globalThis|localStorage|sessionStorage|location|navigator)\s*[.[]|(?<![\w.])(getDocs|getDoc|setDoc|deleteDoc|collection|query|fetch|\$)\s*\(/;
for (const [name, code] of [['ADMIN CORE', coreCode], ['ADMIN CLASSIFY', classifyCode]]) {
  const lines = code.split('\n').map((l) => l.replace(/\/\/.*$/, ''));
  const bad = lines.findIndex((l) => forbidden.test(l));
  if (bad >= 0) { console.error(`${name}: zakázaný odkaz na prostředí stránky: ${lines[bad].trim()}`); process.exit(1); }
}

function loadCore() {
  const ctx = vm.createContext({});
  const exportsCode = ';({ classifyInstall, makeDeduper, plainEvent, plainMap, plainInstall, buildIndex, computeAcquisition, computeJourney, computeTech, computeMeta, VERDICT_RULES })';
  return vm.runInContext(`${classifyCode}\n${coreCode}\n${exportsCode}`, ctx, { filename: 'admin-core.js' });
}

// ── Vstup stejně jako window.__dash.setData: stejná normalizace (plainEvent, plainInstall) jako fetchPage a
//    loadInstalls v produkci, pak deduplikace (výpis má všechna ts jako čísla).
const anyMs = (v) => (typeof v === 'number' ? v : typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
function makeInput(core, adCampaigns) {
  const dedup = core.makeDeduper();
  const raw = [];
  for (const e of Array.isArray(dump.RAW) ? dump.RAW : []) {
    if (!e || typeof e !== 'object') continue;
    const x = core.plainEvent(e, e.installId, core.plainMap(e.dev), anyMs(e.ts));
    if (dedup.add(x)) raw.push(x);
  }
  const overrides = new Map(dump.OVERRIDES && typeof dump.OVERRIDES === 'object' ? Object.entries(dump.OVERRIDES) : []);
  const installs = (Array.isArray(dump.INSTALLS) ? dump.INSTALLS : []).filter((i) => i && typeof i === 'object')
    .map((i) => core.plainInstall(i, anyMs(i.firstMs), anyMs(i.lastMs)));
  for (const i of installs) i.cls = core.classifyInstall(i, overrides.get(i.id) || null);
  const meta = dump.meta || {};
  const now = Date.parse(meta.dumpedAt);
  if (!Number.isFinite(now)) usage('Výpis nemá meta.dumpedAt.');
  return {
    raw, installs, overrides,
    rcEvents: (Array.isArray(dump.RC_EVENTS) ? dump.RC_EVENTS : []).filter((x) => x && x.type),
    store: (Array.isArray(dump.STORE) ? dump.STORE : []).filter((x) => x && x.date && (x.platform === 'ios' || x.platform === 'android')),
    retention: dump.RETENTION || null,
    adCampaigns: adCampaigns !== undefined ? adCampaigns : (dump.AD_CAMPAIGNS && typeof dump.AD_CAMPAIGNS === 'object' ? dump.AD_CAMPAIGNS : null),
    catalog, now,
    loaded: { dups: dedup.dups, dupLog: dedup.log, batches: typeof meta.batches === 'number' ? meta.batches : null, complete: true },
  };
}

// ── Porovnání
const TOL = { z: 0.001, perDay: 0.0001, above: 0.01, cost: 0.01, spendEur: 0.01 };
function compare(refV, gotV, p, out) {
  out.keys++;
  const last = p.split('.').pop().replace(/\[\d+\]$/, '');
  if (typeof refV === 'number' && typeof gotV === 'number') {
    const tol = Object.hasOwn(TOL, last) ? TOL[last] + 1e-9 : 0;
    if (Math.abs(refV - gotV) > tol) out.diffs.push(`${p}: reference ${refV} · jádro ${gotV}`);
    return;
  }
  if (refV === null || gotV === null || typeof refV !== 'object' || typeof gotV !== 'object') {
    if (refV !== gotV) out.diffs.push(`${p}: reference ${JSON.stringify(refV)} · jádro ${JSON.stringify(gotV)}`);
    return;
  }
  if (Array.isArray(refV) !== Array.isArray(gotV)) { out.diffs.push(`${p}: jiný typ (pole × objekt)`); return; }
  if (Array.isArray(refV)) {
    if (refV.length !== gotV.length) out.diffs.push(`${p}: délka reference ${refV.length} · jádro ${gotV.length} (${JSON.stringify(refV).slice(0, 300)} × ${JSON.stringify(gotV).slice(0, 300)})`);
    const n = Math.min(refV.length, gotV.length);
    for (let i = 0; i < n; i++) compare(refV[i], gotV[i], `${p}[${i}]`, out);
    return;
  }
  out.keys--; // objekt sám se nepočítá, jen jeho listy
  for (const k of Object.keys(refV)) {
    if (!Object.hasOwn(gotV, k)) { out.keys++; out.diffs.push(`${p}.${k}: v jádru chybí (reference ${JSON.stringify(refV[k]).slice(0, 200)})`); continue; }
    compare(refV[k], gotV[k], `${p}.${k}`, out);
  }
  for (const k of Object.keys(gotV)) if (!Object.hasOwn(refV, k)) out.diffs.push(`${p}.${k}: navíc v jádru (${JSON.stringify(gotV[k]).slice(0, 200)})`);
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }
function run(label, fileTag, refObj, adCampaigns) {
  const core = loadCore(); // čerstvý kontext = studená mezipaměť pražských dnů jako v prohlížeči
  const input = makeInput(core, adCampaigns);
  const t0 = performance.now();
  let idx = core.buildIndex(input);
  const cold = performance.now() - t0;
  const warm = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); idx = core.buildIndex(input); warm.push(performance.now() - t); }
  // 30 dní: jen události v okně (asi 33 000), jako po otevření Souhrnu v produkci.
  const from = input.now - 30 * 86400000;
  const input30 = { ...input, raw: input.raw.filter((e) => typeof e.ts === 'number' && e.ts > from) };
  const core30 = loadCore();
  const t1 = performance.now(); core30.buildIndex(input30); const cold30 = performance.now() - t1;
  const warm30 = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); core30.buildIndex(input30); warm30.push(performance.now() - t); }
  const t2 = performance.now();
  const got = { meta: core.computeMeta(idx), acq: core.computeAcquisition(idx), jr: core.computeJourney(idx), tech: core.computeTech(idx) };
  const computeMs = performance.now() - t2;
  const plain = JSON.parse(JSON.stringify(got));
  const out = { keys: 0, diffs: [] };
  for (const part of ['acq', 'jr', 'tech']) {
    if (!Object.hasOwn(refObj, part)) { out.diffs.push(`${part}: v referenci chybí`); continue; }
    compare(refObj[part], plain[part], part, out);
  }
  for (const k of Object.keys(plain)) if (k !== 'meta' && !Object.hasOwn(refObj, k)) out.diffs.push(`${k}: navíc v jádru`);
  const ms = (x) => x.toFixed(1) + ' ms';
  console.log(`\n${label}`);
  console.log(`  záznamů ${input.raw.length + input.loaded.dups} → po deduplikaci ${input.raw.length} (vyřazeno ${input.loaded.dups}); 30 dní: ${input30.raw.length}`);
  console.log(`  buildIndex celý výpis: studený ${ms(cold)}, teplý medián ${ms(median(warm))}`);
  console.log(`  buildIndex 30 dní:     studený ${ms(cold30)}, teplý medián ${ms(median(warm30))} (cíl < ${INDEX_LIMIT_MS} ms)`);
  console.log(`  compute* (acq + jr + tech): ${ms(computeMs)}`);
  console.log(`  porovnáno klíčů: ${out.keys}, rozdílů: ${out.diffs.length}`);
  for (const d of out.diffs.slice(0, 200)) console.log('   ✗ ' + d);
  if (out.diffs.length > 200) console.log(`   … a dalších ${out.diffs.length - 200}`);
  if (opt.out) {
    fs.mkdirSync(path.resolve(opt.out), { recursive: true });
    fs.writeFileSync(path.join(path.resolve(opt.out), `core-${fileTag}.json`), JSON.stringify(plain, null, 1));
  }
  const slow = cold30 > INDEX_LIMIT_MS;
  if (slow) console.log(`   ✗ buildIndex nad 30 dny trvá ${ms(cold30)} (cíl < ${INDEX_LIMIT_MS} ms)`);
  return out.diffs.length === 0 && !slow;
}

let ok = run('Výpis bez zápisu kampaní', 'bez-kampani', ref, null);
if (opt.campaigns) {
  const fixture = readJson(opt.campaigns[0], 'zápis kampaní');
  const refC = readJson(opt.campaigns[1], 'referenci s kampaněmi');
  ok = run('Výpis s testovacím zápisem kampaní', 's-kampanemi', refC, fixture) && ok;
}
console.log(ok ? '\nJádro sedí s referencí.' : '\nJádro NESEDÍ s referencí nebo je pomalé.');
process.exit(ok ? 0 : 1);
