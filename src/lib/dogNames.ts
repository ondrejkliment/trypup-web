// Data a pomocné funkce pro stránku /jmena-pro-psa/ (zatím jen česky).
// Zdroj: src/data/dog-names.json = snímek databáze jmen z aplikace Trypup,
// generuje ho scripts/gen-dog-names.mjs (ručně neupravovat).
// suggestNames + seededRandom jsou 1:1 z aplikace (src/modules/pesdoma/names.ts);
// klientská kopie losování je ve skriptu stránky.
import data from '../data/dog-names.json';

export type Sex = 'male' | 'female' | 'unisex';
export type CsName = { id: string; name: string; sex: Sex; date: string; reason: string | null };

type Entry = { id: string; forms: { cs?: string }; sex: Sex; date: string; reasonKey?: string };
const reasonsCs = data.reasons.cs as Record<string, string>;
const collator = new Intl.Collator('cs');

/** Česká typografie: nezlomitelná mezera za jednopísmennou předložkou/spojkou a uvnitř data („3. 11. 1957“). */
export function czTypo(text: string): string {
  let out = text;
  for (let i = 0; i < 2; i++) out = out.replace(/(^|[\s(„])([AIKOSUVZaikosuvz])\s+/g, '$1$2\u00a0');
  return out.replace(/(\b\d{1,2}\.) (?=\d)/g, '$1\u00a0');
}

/** Jména s českým tvarem, seřazená podle české abecedy (Ch za H, Č za C…). */
export const CS_NAMES: CsName[] = (data.names as Entry[])
  .filter((e) => e.forms.cs)
  .map((e) => ({ id: e.id, name: e.forms.cs!, sex: e.sex, date: e.date, reason: e.reasonKey && reasonsCs[e.reasonKey] ? czTypo(reasonsCs[e.reasonKey]) : null }))
  .sort((a, b) => collator.compare(a.name, b.name));

export const MONTHS_GENITIVE = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const MONTHS_NOMINATIVE = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

/** „3. listopadu“ z MM-DD (s nezlomitelnou mezerou). */
export function formatNameDay(md: string): string {
  const [m, d] = md.split('-').map(Number);
  return `${d}.\u00a0${MONTHS_GENITIVE[m - 1]}`;
}

export const SEX_LABEL: Record<Sex, string> = { male: 'pes', female: 'fena', unisex: 'pes i\u00a0fena' };

/** 1 jméno, 2–4 jména, 5 jmen. */
export function namesCount(n: number): string {
  return `${n} ${n === 1 ? 'jméno' : n >= 2 && n <= 4 ? 'jména' : 'jmen'}`;
}

/** Písmeno české abecedy pro skupinu (Ch je samostatné, Á patří k A, Č ne). */
function czechLetter(name: string): string {
  if (/^ch/i.test(name)) return 'Ch';
  const c = name.charAt(0).toUpperCase();
  const base: Record<string, string> = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ů: 'U', Ý: 'Y', Ď: 'D', Ť: 'T', Ň: 'N' };
  return base[c] ?? c;
}

export function byLetter(list: CsName[]): { letter: string; names: CsName[] }[] {
  const out: { letter: string; names: CsName[] }[] = [];
  for (const n of list) {
    const l = czechLetter(n.name);
    const last = out[out.length - 1];
    if (last && last.letter === l) last.names.push(n);
    else out.push({ letter: l, names: [n] });
  }
  return out;
}

export function byMonth(list: CsName[]): { month: number; label: string; count: number; days: { md: string; label: string; names: string[] }[] }[] {
  return MONTHS_NOMINATIVE.map((label, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const inMonth = list.filter((n) => n.date.startsWith(mm + '-'));
    const dates = [...new Set(inMonth.map((n) => n.date))].sort();
    return {
      month: i + 1,
      label,
      count: inMonth.length,
      days: dates.map((md) => ({ md, label: formatNameDay(md), names: inMonth.filter((n) => n.date === md).map((n) => n.name) })),
    };
  });
}

/** Deterministický generátor z [0, 1) (mulberry32), stejný jako v aplikaci. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` různých jmen, částečné Fisher-Yates (jako `suggestNames` v aplikaci, bez `exclude`). */
export function suggestNames<T>(pool: readonly T[], count: number, random: () => number): T[] {
  const arr = [...pool];
  const n = Math.min(count, arr.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, n);
}
