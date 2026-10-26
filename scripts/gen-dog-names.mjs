// Snímek databáze psích jmen z aplikace Trypup pro web (stránka /jmena-pro-psa/).
//
// Spuštění (Node >= 22.18, umí načíst .ts bez překladu):
//   node scripts/gen-dog-names.mjs <cesta k repu aplikace>
//   např. node scripts/gen-dog-names.mjs ~/Developer/Pawprint/pawprint-pesdoma
// (Varování MODULE_TYPELESS_PACKAGE_JSON je neškodné, potlačí ho `node --no-warnings`.)
//
// Čte z aplikace (jen čtení):
//   src/data/pesdoma/names/dogNames.ts         jména, tvary cs/sk/en, pohlaví, štítky, data jmenin
//   src/data/pesdoma/content/names.{cs,sk,en}.ts  důvody ručních výjimek (Lajka, Rex…)
// Zapisuje src/data/dog-names.json. Ten se commituje a web ho čte při buildu;
// ručně ho neupravuj, oprava patří do aplikace a sem se dostane dalším spuštěním.
//
// Seznam jmen i data jmenin jsou VLASTNÍ práce Trypupu (viz hlavička dogNames.ts),
// nic se nepřebírá z cizích kalendářů. Data se tu NEPOČÍTAJÍ, bere se uložené `date`.
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = process.argv[2] && resolve(process.argv[2]);
if (!appRoot) {
  console.error('Použití: node scripts/gen-dog-names.mjs <cesta k repu aplikace>');
  process.exit(1);
}

const NAMES_REL = 'src/data/pesdoma/names/dogNames.ts';
const REASONS_REL = { cs: 'src/data/pesdoma/content/names.cs.ts', sk: 'src/data/pesdoma/content/names.sk.ts', en: 'src/data/pesdoma/content/names.en.ts' };
const REASONS_EXPORT = { cs: 'nameReasonsCs', sk: 'nameReasonsSk', en: 'nameReasonsEn' };

for (const rel of [NAMES_REL, ...Object.values(REASONS_REL)]) {
  if (!existsSync(join(appRoot, rel))) {
    console.error(`Chybí ${rel} v ${appRoot}`);
    process.exit(1);
  }
}

const load = (rel) => import(pathToFileURL(join(appRoot, rel)).href);
const { DOG_NAMES } = await load(NAMES_REL);
const reasons = {};
for (const lang of Object.keys(REASONS_REL)) reasons[lang] = { ...(await load(REASONS_REL[lang]))[REASONS_EXPORT[lang]] };

// Kontrola tvaru: build webu nesmí dostat rozbitá data.
const SEX = new Set(['male', 'female', 'unisex']);
const ids = new Set();
const problems = [];
for (const e of DOG_NAMES) {
  if (!e.id || ids.has(e.id)) problems.push(`duplicitní nebo prázdné id: ${e.id}`);
  ids.add(e.id);
  if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(e.date) || e.date === '02-29') problems.push(`${e.id}: neplatné datum ${e.date}`);
  if (!SEX.has(e.sex)) problems.push(`${e.id}: neznámé pohlaví ${e.sex}`);
  if (!e.forms || !Object.values(e.forms).some(Boolean)) problems.push(`${e.id}: žádný tvar jména`);
  if (e.reasonKey && !Object.values(reasons).every((r) => typeof r[e.reasonKey] === 'string')) problems.push(`${e.id}: chybí důvod ${e.reasonKey}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

// Odkud a kdy: poslední commit aplikace, který zdrojové soubory měnil, a jestli
// nebyly v pracovní kopii rozpracované (pak snímek neodpovídá žádnému commitu).
const git = (...args) => {
  try { return execFileSync('git', ['-C', appRoot, ...args], { encoding: 'utf8' }).trim(); } catch { return ''; }
};
const files = [NAMES_REL, ...Object.values(REASONS_REL)];
const appCommit = git('log', '-1', '--format=%h %cs', '--', ...files) || 'neznámý';
const dirty = git('status', '--porcelain', '--', ...files) !== '';

const pick = (e) => {
  const out = { id: e.id, forms: e.forms, sex: e.sex };
  if (e.tags?.length) out.tags = e.tags;
  if (e.aliases?.length) out.aliases = e.aliases;
  out.date = e.date;
  if (e.reasonKey) out.reasonKey = e.reasonKey;
  return out;
};

const snapshot = {
  _source: `Vygenerováno skriptem scripts/gen-dog-names.mjs z aplikace Trypup (${NAMES_REL} a src/data/pesdoma/content/names.{cs,sk,en}.ts). Ručně neupravovat, obnovit: node scripts/gen-dog-names.mjs <cesta k repu aplikace>.`,
  _appCommit: appCommit + (dirty ? ' + neuložené změny' : ''),
  _generatedAt: new Date().toISOString().slice(0, 10),
  counts: {
    total: DOG_NAMES.length,
    cs: DOG_NAMES.filter((e) => e.forms.cs).length,
    sk: DOG_NAMES.filter((e) => e.forms.sk).length,
    en: DOG_NAMES.filter((e) => e.forms.en).length,
  },
  names: DOG_NAMES.map(pick),
  reasons,
};

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'src', 'data', 'dog-names.json');
// Jedno jméno na řádek: čitelný diff při obnovení snímku.
const { names, ...head } = snapshot;
const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '');
const body = names.map((e) => '    ' + JSON.stringify(e)).join(',\n');
writeFileSync(outFile, `${headJson},\n  "names": [\n${body}\n  ]\n}\n`);
JSON.parse((await import('node:fs')).readFileSync(outFile, 'utf8')); // pojistka: platný JSON
console.log(`OK: ${outFile}\n  jmen ${snapshot.counts.total} (cs ${snapshot.counts.cs}, sk ${snapshot.counts.sk}, en ${snapshot.counts.en}), aplikace ${snapshot._appCommit}`);
