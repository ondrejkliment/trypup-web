// Jednorázový generátor katalogu popisků akcí pro admin (src/data/admin-labels.json, tvar v2).
//
//   node scripts/build-admin-labels.mjs <catalog-A.json> <catalog-B.json> <catalog-C.json> <výstup.json> [<výpis.json>]
//
// Vstup: zdrojové katalogy (pole akcí {name, group, cs, en, descCs, mode, since, status, where, props}).
// Výstup se dál udržuje ručně; hlídá ho scripts/check-admin-labels.mjs. Nepovinný 5. argument je výpis
// dat ({RAW:[{name, props, ts, dev:{appBuild}}]}): doplní verzi (sb) a den (od) tam, kde je katalog nemá,
// a vypíše hodnoty z dat, které v katalogu chybí. Výpis se nikam nekopíruje.
//
// Tvar v2:
//   v       2
//   groups  [[id, cs, en], …, ["unknown", "Nezařazené", "Unclassified"]]
//   ev      { název: { g, cs, en, sb, od, st, auto, m, p } }
//             g     skupina (id z groups)
//             sb    verze, od které akci telefony posílají (číslo; 0 = nikdy neposlána, jen u st "removed")
//             od    první den (ISO, Europe/Prague; null jen u st "removed" bez dat)
//             st    "live" | "removed" (už se neposílá) | "testers" (zatím jen testeři)
//             auto  1 = posílá aplikace sama (spuštění, obrazovka, odznak…), není to činnost člověka
//             m     režim: "none" | "both" | "trial" | "owner"
//             p     { klíč: { cs, en, v?, f?, ref?, sb?, od? } }
//                   v    { hodnota: [cs, en] } nebo [cs, en, sb, od], když hodnota přišla později než akce
//                   f    1 = volný text (útulky, kampaně, zdroje odkazů): neznámou hodnotu ukázat tak, jak je
//                   ref  "screens" = hodnoty jsou v top-level screens (screen_view.screen)
//                   sb, od  vlastnost se posílá až od této verze a dne
//                   Bez v = číslo nebo volný text, ukazuje se tak, jak je.
//   screens { trasa: [cs, en, místo|null] | [cs, en, místo|null, alias|null] | [cs, en, místo|null, alias|null, sb, od] }
//             alias = současná trasa téže obrazovky (přejmenované trasy), sb/od = obrazovky Psa doma od 2.0.0
//   places  { místo: [cs, en] }   místa Psa doma (SPEC C.2 B3)
//
// Vynecháno: where (cesty v kódu) a všechny popisy (descCs), viz SPEC D.1.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [, , A, B, C, OUT, DUMP] = process.argv;
if (!A || !B || !C || !OUT) {
  console.error('Použití: node scripts/build-admin-labels.mjs <catalog-A.json> <catalog-B.json> <catalog-C.json> <výstup.json> [<výpis.json>]');
  process.exit(2);
}

// ---------- Pevné části (SPEC D.1) ----------
const GROUPS = [
  ['start', 'Spuštění a vstup', 'Launch & entry'],
  ['onboarding', 'Úvod a založení psa', 'Onboarding & activation'],
  ['care', 'Péče o psa na zkoušku', 'Trial dog care'],
  ['walk', 'Procházky', 'Walks'],
  ['training', 'Výcvik', 'Training'],
  ['learning', 'Vzdělávání', 'Learning'],
  ['challenge', '30denní výzva', '30-day challenge'],
  ['mission', 'Mise a útulky', 'Mission & shelters'],
  ['owner', 'Pes doma', 'Dog at home'],
  ['reminders', 'Připomínky a oznámení', 'Reminders & notifications'],
  ['social', 'Sdílení a společná péče', 'Sharing & co-care'],
  ['money', 'Premium a nákupy', 'Premium & purchases'],
  ['account', 'Účet a záloha', 'Account & backup'],
  ['feedback', 'Hodnocení a podpora', 'Ratings & support'],
  ['quality', 'Chyby a kvalita', 'Errors & quality'],
  ['experiments', 'Testy variant', 'A/B tests'],
  ['navigation', 'Obrazovky', 'Screens'],
  ['unknown', 'Nezařazené', 'Unclassified'],
];
const GROUP_FIX = { owner_dog_choice: 'owner' };
const STATUS_FIX = { family: 'testers' };
// R11: akce, které posílá aplikace sama.
const AUTO = new Set(['app_open', 'app_entry', 'session_end', 'screen_view', 'install_source', 'day_advanced', 'level_up',
  'achievement_unlocked', 'restore_key_result', 'store_rating_blocked', 'experiment_assigned']);

// Ruční verze a dny ověřené na datech (SPEC D.1); mají přednost před katalogem i daty. null = nechat z katalogu.
const SINCE_FIX = {
  mode_switched: [292, '2026-10-23'], calendar_event_opened: [292, '2026-10-23'], map_opened: [292, '2026-10-23'],
  owner_activated: [320, '2026-11-06'], owner_setup_exit: [319, '2026-11-06'],
  plan_item: [337, '2026-11-15'], diary_entry: [337, '2026-11-15'], weight_entry: [337, '2026-11-15'],
  setup_checklist: [337, '2026-11-15'], real_reminder_opened: [337, '2026-11-15'],
  training_logged: [312, '2026-10-31'], training_stage_confirmed: [312, '2026-10-31'], training_help_opened: [312, '2026-10-31'],
  dog_document: [304, null], dog_photo: [301, null],
  care_reminder_opened: [335, '2026-11-14'], care_reminder_done: [335, '2026-11-14'],
  notification_permission: [288, '2026-10-13'], care_reminder_prompt: [288, '2026-10-13'],
  app_entry: [342, '2026-11-16'], experiment_assigned: [344, '2026-11-16'], purchases_link: [344, '2026-11-16'],
  install_source: [352, '2026-11-18'], challenge_decision: [287, '2026-10-11'],
  share_completed: [284, '2026-10-07'], coop_invite_created: [284, '2026-10-07'], coop_joined: [284, '2026-10-07'],
  share_initiated: [216, '2026-07-02'],
};
// Vlastnosti a hodnoty, které přišly později než samotná akce (SPEC D.1).
const PROP_SINCE = {
  'screen_view.mode': [291, '2026-10-23'],
  'onboarding_step.choice': [293, '2026-10-26'],
  'onboarding_step.dir': [314, '2026-11-01'],
};
const VALUE_SINCE = {
  'onboarding_step.step.owner_setup': [293, '2026-10-26'],
  'walk_started.mode.owner': [338, '2026-11-15'],
  'walk_completed.mode.owner': [338, '2026-11-15'],
};
const SCREEN_SINCE = { prefix: 'pesdoma/', since: [291, '2026-10-23'] };

// ---------- Ruční opravy popisků (krok 4 zadání) ----------
const EV_FIX = {
  language_offer: ['Nabídka jazyka telefonu', 'Phone language offer'],
  fail_state: ['Pes skončil v útulku', 'Dog ended up in a shelter'],
  experiment_assigned: ['Přiřazení do testu variant', 'Assigned to an A/B test'],
  real_reminder_opened: ['Otevření připomínky Psa doma', 'Dog at home reminder opened'],
  owner_activated: [null, 'Dog at home created'],
  store_rating_blocked: [null, 'Rating prompt blocked'],
};
// Klíč 'akce.vlastnost', '*' = u všech akcí.
const PROP_FIX = {
  'install_source.source': ['Zdroj odkazu', 'Link source'],
  'install_source.medium': ['Druh odkazu', 'Link type'],
  'install_source.campaign': ['Kampaň', 'Campaign'],
  'session_end.events': ['Počet akcí v relaci', 'Actions in session'],
  'readiness_completed.phase': ['Odkud vyplněno', 'Where filled in'],
  'app_error.context': ['Kde nastala', 'Where it happened'],
  'experiment_assigned.name': ['Test', 'Test'],
  'owner_activated.birthPrecision': ['Přesnost data narození', 'Birth date precision'],
  'challenge_completed.spendVet': ['Útrata za veterinu (Kč)', 'Vet spend (CZK)'],
  'challenge_completed.spendHotel': ['Útrata za psí hotel (Kč)', 'Dog hotel spend (CZK)'],
  'challenge_completed.verdictModel': ['Verze výpočtu verdiktu', 'Verdict model version'],
  '*.metrics': ['Úplnost údajů', 'Data completeness'],
  'share_initiated.kind': ['Co sdílel', 'What was shared'],
  'share_completed.kind': ['Co sdílel', 'What was shared'],
  'setup_checklist.done': ['Hotových položek', 'Items done'],
  'setup_checklist.total': ['Položek celkem', 'Items total'],
  'care_reminder_opened.hour': ['Plánovaná hodina', 'Scheduled hour'],
  'care_reminder_opened.minutesAfter': ['Minut od plánovaného času', 'Minutes after scheduled time'],
  'app_entry.launch': ['Druh otevření', 'Launch type'],
  'app_entry.notif': ['Druh oznámení', 'Notification type'],
  'paywall_viewed.from': ['Odkud (starší verze)', 'From (older versions)'],
};
// Klíč 'akce.vlastnost.hodnota', '*' = u všech akcí. null = ponechat.
const VALUE_FIX = {
  'install_source.channel.none': ['Zdroj nezjištěn', 'Unknown source'],
  'install_source.channel.play_unknown': [null, 'Google Play, no link'],
  'install_source.source.': ['Neuvedeno', 'Not given'],
  'install_source.medium.': ['Neuvedeno', 'Not given'],
  'widget_offer.outcome.ignored': ['Telefon nic neukázal', 'Phone showed nothing'],
  'onboarding_step.step.owner_setup': [null, 'Went to real dog setup'],
  '*.metrics.full': ['Úplné', 'Complete'],
  '*.metrics.partial': ['Částečné', 'Partial'],
  'shelter_opened.shelter.map': ['Mapa útulků', 'Shelter map'],
  'calendar_event_opened.result.saved': ['Uloženo (iPhone)', 'Saved (iPhone)'],
  'dog_photo.picker.system': ['Systémový výběr (iPhone)', 'System picker (iPhone)'],
  'subscription_manage_opened.via.sheet': ['Systémové okno (iPhone)', 'System sheet (iPhone)'],
  'app_entry.source.notification': ['Oznámení', 'Notification'],
  'app_entry.launch.cold': ['Nové spuštění', 'Fresh launch'],
  'app_entry.launch.warm': ['Návrat z pozadí', 'Back from background'],
  'app_entry.notif.real': ['Připomínka Psa doma', 'Dog at home reminder'],
  'app_entry.notif.other': ['Jiné oznámení', 'Other notification'],
  'notification_permission.source.care_reminders': ['Připomínky Psa na zkoušku', 'Trial dog care reminders'],
  'care_reminder_opened.slot.pause': ['Poslední připomínka před pauzou', 'Last reminder before a pause'],
  'store_rating_prompt.result.requested': ['Vyžádáno u systému', 'Requested from the system'],
  'store_rating_prompt.result.failed': ['Selhalo', 'Failed'],
  'restore_key_result.kind.not_found': ['Klíč nenalezen', 'Key not found'],
};
// Režim: všechny vlastnosti mode znají obě slovní zásoby (paywall a úvod: challenge/classic/challenge30/owner,
// procházky, obrazovky a přepnutí: trial/owner), aby admin nepotřeboval vlastní MODE_LABEL.
const MODE_VALUES = {
  trial: ['Pes na zkoušku', 'Trial dog'],
  challenge: ['30denní výzva', '30-day challenge'],
  challenge30: ['30denní výzva', '30-day challenge'],
  classic: ['Pes na zkoušku bez výzvy', 'Trial dog, no challenge'],
  owner: ['Pes doma', 'Dog at home'],
};
// Ano/ne vlastnosti (v datech JSON true/false), ověřeno na výpisu 19. 11. 2026.
const BOOL_PROPS = new Set([
  'breed_selected.adopted', 'breed_selected.isPremium', 'breed_selected.matchedRecommendation', 'breed_selected.ownsPremium',
  'challenge_completed.repeat', 'challenge_completed.testPassed', 'challenge_decision.failed', 'challenge_decision.repeat',
  'challenge_started.repeat', 'event_choice.best', 'lesson_answered.correct', 'myth_answered.correct', 'review_answered.correct',
  'mode_switched.challenge', 'notification_permission.prompted', 'owner_activated.puppy', 'owner_activated.vet',
  'owner_setup_exit.touched', 'purchases_link.hadPurchases', 'restore_key_created.cloudBackup', 'task_done.firstToday',
  'training_done.leveledUp', 'training_logged.timer', 'tutorial_done.firstRun', 'tutorial_done.skipped', 'walk_completed.valid',
]);
const BOOL_VALUES = { true: ['Ano', 'Yes'], false: ['Ne', 'No'] };
// Volný text: neznámou hodnotu ukázat tak, jak je (SPEC D.5).
const FREE_TEXT = new Set(['shelter_opened.shelter', 'push_opened.campaign', 'install_source.source', 'install_source.medium',
  'install_source.campaign', 'purchase_failed.message', 'purchase_failed.underlying', 'restore_failed.message',
  'restore_failed.underlying', 'app_error.context']);
// Názvy útulků jsou volný text: z katalogu zůstane jen „map“ (SPEC C.2 B6: názvy se sjednotí, nepřekládají).
const KEEP_ONLY = { 'shelter_opened.shelter': new Set(['map']) };
// Doplněné hodnoty (krok 3 zadání).
const ADD_VALUES = {
  'install_source.campaign': { '': ['Bez kampaně', 'No campaign'] },
};
// Kroky úvodu: předchozí krok a krok při odchodu znají všechny kroky.
const STEP_UNION = ['onboarding_step.fromStep', 'session_end.onbStep'];

// Obrazovky: místa Psa doma podle SPEC C.2 B3 a přejmenované trasy.
const PLACES = {
  plan: ['Plán péče', 'Care plan'],
  diary: ['Deník a váha', 'Diary & weight'],
  docs: ['Pas a dokumenty', 'Passport & documents'],
  firstaid: ['První pomoc', 'First aid'],
  training: ['Výcvik', 'Training'],
  vets: ['Veteriny a mapa', 'Vets & map'],
  walk: ['Procházka', 'Walk'],
  family: ['Rodina', 'Family'],
};
const SCREEN_PLACE = {
  'pesdoma/dog/[id]/plan': 'plan',
  'pesdoma/dog/[id]/diary': 'diary', 'pesdoma/dog/[id]/entry': 'diary', 'pesdoma/dog/[id]/weight': 'diary',
  'pesdoma/dog/[id]/passport': 'docs', 'pesdoma/dog/[id]/documents': 'docs', 'pesdoma/dog/[id]/scan': 'docs', 'pesdoma/dog/[id]/summary': 'docs',
  'pesdoma/first-aid': 'firstaid', 'pesdoma/first-aid/[topic]': 'firstaid',
  'pesdoma/dog/[id]/training': 'training', 'pesdoma/dog/[id]/training/[skill]': 'training', 'pesdoma/dog/[id]/training/session': 'training',
  'pesdoma/training/guide': 'training', 'pesdoma/training/help': 'training', 'pesdoma/training/puppy': 'training',
  'pesdoma/vets': 'vets', 'pesdoma/vet/[id]': 'vets',
  'pesdoma/walk': 'walk', 'pesdoma/walk-summary': 'walk',
  'pesdoma/dog/[id]/family': 'family', 'pesdoma/family-join': 'family',
};
// Projde jimi každý při založení psa (patří do A1), místo nemají.
const SCREEN_NO_PLACE = new Set(['pesdoma/setup', 'pesdoma/dog/[id]', 'pesdoma/dog/[id]/edit']);
const SCREEN_FIX = {
  '(main)/friends': ['Společná péče', 'Shared care', 'friends'],
  '(main)/health': ['Zdraví', 'Health', 'health'],
};

// ---------- Pomocné ----------
const NBSP = ' ';
const csText = (s) => String(s)
  .replace(/ – /g, NBSP + '– ')               // větná pomlčka: nezlomitelná mezera před ní
  .replace(/\(pes na zkoušku\)/g, '(Pes na zkoušku)')
  .replace(/v seznamu Doplň(?!“)/g, 'v seznamu „Doplň“');
const enText = (s) => String(s)
  .replace(/the to-do list/g, 'the checklist')
  .replace(/\(trial dog\)/g, '(Trial dog)')
  .replace(/\(dog at home\)/g, '(Dog at home)')
  .replace(/Shelter Mix/g, 'Shelter mix');
const pick = (map, ...keys) => { for (const k of keys) if (Object.hasOwn(map, k)) return map[k]; return undefined; };
const TECH = /(?<![\p{L}\p{N}])(build|event|props|installId|referrer|utm_)/iu;

function parseSince(since) {
  if (!since) return { sb: null, od: null };
  const head = String(since).split(';')[0];
  const b = head.match(/build[u]?\s+(\d+)/i);
  const iso = head.match(/(\d{4})-(\d{2})-(\d{2})/);
  const cz = head.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  let od = null;
  if (iso && (!cz || iso.index < cz.index)) od = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (cz) od = `${cz[3]}-${cz[2].padStart(2, '0')}-${cz[1].padStart(2, '0')}`;
  return { sb: b ? Number(b[1]) : null, od };
}

const pragueDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

// ---------- Načtení ----------
const catalog = [];
for (const f of [A, B, C]) catalog.push(...JSON.parse(readFileSync(f, 'utf8')));
const byName = new Map(catalog.map((e) => [e.name, e]));
if (byName.size !== catalog.length) { console.error('Katalog obsahuje duplicitní názvy akcí.'); process.exit(1); }

let raw = null;
const dataFirst = new Map(); // název → {b, ts}
if (DUMP) {
  raw = JSON.parse(readFileSync(DUMP, 'utf8')).RAW || [];
  for (const e of raw) {
    const n = String(e.name);
    const b = Number(e.dev && e.dev.appBuild);
    const ts = Number(e.ts);
    let f = dataFirst.get(n); if (!f) dataFirst.set(n, f = { b: null, ts: null });
    if (Number.isFinite(b) && (f.b === null || b < f.b)) f.b = b;
    if (Number.isFinite(ts) && (f.ts === null || ts < f.ts)) f.ts = ts;
  }
}

const techBefore = [];
const log = { added: [], fixed: [], dropped: [] };
const noteTech = (where, s) => { if (TECH.test(s)) techBefore.push(`${where}: ${s}`); };

// ---------- Akce ----------
const groupIds = new Set(GROUPS.map((g) => g[0]));
const groupOrder = new Map(GROUPS.map((g, i) => [g[0], i]));
const ev = {};
const missingSince = [];
let screenValues = null;
const ordered = catalog.map((e, i) => ({ e, i, g: GROUP_FIX[e.name] || e.group }))
  .sort((a, b) => (groupOrder.get(a.g) ?? 99) - (groupOrder.get(b.g) ?? 99) || a.i - b.i);

for (const { e, g } of ordered) {
  if (!groupIds.has(g)) { console.error(`Neznámá skupina ${g} u ${e.name}`); process.exit(1); }
  noteTech(e.name, e.cs);
  const evFix = EV_FIX[e.name] || [];
  const cs = csText(evFix[0] ?? e.cs), en = enText(evFix[1] ?? e.en);
  if (evFix[0] || evFix[1]) log.fixed.push(`${e.name}: ${e.cs} / ${e.en} → ${cs} / ${en}`);
  const st = STATUS_FIX[e.name] || e.status || 'live';
  let { sb, od } = parseSince(e.since);
  const man = SINCE_FIX[e.name];
  if (man) { sb = man[0]; if (man[1]) od = man[1]; }
  const df = dataFirst.get(e.name);
  if (sb === null && df && df.b !== null) sb = df.b;
  if (od === null && df && df.ts !== null) od = pragueDay(df.ts);
  if (st === 'removed' && sb === null) sb = 0; // nikdy neposlána
  if (sb === null || (od === null && st !== 'removed')) missingSince.push(e.name);

  const p = {};
  const stepValues = new Map();
  for (const pr of e.props || []) if (e.name === 'onboarding_step' && pr.key === 'step') for (const [k, x] of Object.entries(pr.values || {})) stepValues.set(k, x);
  for (const pr of e.props || []) {
    const id = `${e.name}.${pr.key}`;
    noteTech(id, pr.cs);
    const pf = pick(PROP_FIX, id, `*.${pr.key}`) || [];
    const o = { cs: csText(pf[0] ?? pr.cs), en: enText(pf[1] ?? pr.en) };
    if (pf[0] || pf[1]) log.fixed.push(`${id}: ${pr.cs} / ${pr.en} → ${o.cs} / ${o.en}`);
    if (Object.hasOwn(PROP_SINCE, id)) { o.sb = PROP_SINCE[id][0]; o.od = PROP_SINCE[id][1]; }
    if (FREE_TEXT.has(id)) o.f = 1;
    if (id === 'screen_view.screen') { o.ref = 'screens'; screenValues = pr.values || {}; p[pr.key] = o; continue; }

    let src = { ...(pr.values || {}) };
    if (STEP_UNION.includes(id)) {
      for (const [k, x] of stepValues) if (!Object.hasOwn(src, k)) { src[k] = x; log.added.push(`${id} = ${k}`); }
    }
    if (pr.key === 'mode') {
      const before = src;
      src = {};
      for (const [k, x] of Object.entries(MODE_VALUES)) {
        src[k] = { cs: x[0], en: x[1] };
        if (!Object.hasOwn(before, k)) log.added.push(`${id} = ${k}`);
        else if (before[k].cs !== x[0] || before[k].en !== x[1]) log.fixed.push(`${id}.${k}: ${before[k].cs} / ${before[k].en} → ${x[0]} / ${x[1]}`);
      }
    }
    if (Object.hasOwn(ADD_VALUES, id)) for (const [k, x] of Object.entries(ADD_VALUES[id])) if (!Object.hasOwn(src, k)) { src[k] = { cs: x[0], en: x[1] }; log.added.push(`${id} = ${JSON.stringify(k)}`); }
    if (BOOL_PROPS.has(id)) for (const [k, x] of Object.entries(BOOL_VALUES)) if (!Object.hasOwn(src, k)) { src[k] = { cs: x[0], en: x[1] }; log.added.push(`${id} = ${k}`); }

    const keys = Object.keys(src);
    if (keys.length) {
      o.v = {};
      for (const k of keys) {
        const vid = `${id}.${k}`;
        if (KEEP_ONLY[id] && !KEEP_ONLY[id].has(k)) { log.dropped.push(vid); continue; }
        const x = src[k];
        noteTech(vid, x.cs ?? k);
        const vf = pick(VALUE_FIX, vid, `*.${pr.key}.${k}`) || [];
        const arr = [csText(vf[0] ?? x.cs ?? k), enText(vf[1] ?? x.en ?? k)];
        if (vf[0] || vf[1]) log.fixed.push(`${vid}: ${x.cs} / ${x.en} → ${arr[0]} / ${arr[1]}`);
        if (Object.hasOwn(VALUE_SINCE, vid)) arr.push(...VALUE_SINCE[vid]);
        o.v[k] = arr;
      }
    }
    p[pr.key] = o;
  }
  ev[e.name] = { g, cs, en, sb, od, st, auto: AUTO.has(e.name) ? 1 : 0, m: e.mode || 'none', p };
}
for (const n of AUTO) if (!Object.hasOwn(ev, n)) { console.error(`auto: akce ${n} v katalogu není`); process.exit(1); }

// ---------- Obrazovky ----------
if (!screenValues) { console.error('V katalogu chybí screen_view.screen.'); process.exit(1); }
const screens = {};
for (const [route, x] of Object.entries(screenValues)) {
  noteTech(`screen ${route}`, x.cs);
  const fix = SCREEN_FIX[route];
  const csl = csText(fix ? fix[0] : x.cs), enl = enText(fix ? fix[1] : x.en);
  if (fix) log.fixed.push(`screen ${route}: ${x.cs} / ${x.en} → ${csl} / ${enl} (alias ${fix[2]})`);
  let place = null;
  if (route.startsWith('pesdoma/')) {
    if (Object.hasOwn(SCREEN_PLACE, route)) place = SCREEN_PLACE[route];
    else if (!SCREEN_NO_PLACE.has(route)) { console.error(`Obrazovka Psa doma bez místa: ${route} (doplň SCREEN_PLACE nebo SCREEN_NO_PLACE)`); process.exit(1); }
  }
  const arr = [csl, enl, place];
  const alias = fix ? fix[2] : null;
  const since = route.startsWith(SCREEN_SINCE.prefix) ? SCREEN_SINCE.since : null;
  if (alias || since) arr.push(alias);
  if (since) arr.push(...since);
  screens[route] = arr;
}
for (const r of Object.keys(SCREEN_PLACE)) if (!Object.hasOwn(screens, r)) { console.error(`SCREEN_PLACE: trasa ${r} v katalogu není`); process.exit(1); }
for (const [, x] of Object.entries(SCREEN_FIX)) if (!Object.hasOwn(screens, x[2])) { console.error(`alias ${x[2]} v katalogu není`); process.exit(1); }

if (missingSince.length) {
  console.error(`Chybí verze nebo den (sb/od) u: ${missingSince.join(', ')}` + (DUMP ? '' : ' – přidej 5. argument s výpisem dat.'));
  process.exit(1);
}

const out = { v: 2, groups: GROUPS, ev, screens, places: PLACES };

// ---------- Zápis: jedna akce, vlastnost a obrazovka na řádek (čitelné rozdíly při ruční údržbě) ----------
const J = (x) => JSON.stringify(x);
const lines = ['{', `"v":2,`, '"groups":['];
GROUPS.forEach((g, i) => lines.push(J(g) + (i < GROUPS.length - 1 ? ',' : '')));
lines.push('],', '"ev":{');
const evNames = Object.keys(ev);
evNames.forEach((n, i) => {
  const { p, ...head } = ev[n];
  const pk = Object.keys(p);
  const h = J(n) + ':' + J(head).slice(0, -1) + ',"p":{';
  if (!pk.length) lines.push(h + '}}' + (i < evNames.length - 1 ? ',' : ''));
  else {
    lines.push(h);
    pk.forEach((k, j) => lines.push(J(k) + ':' + J(p[k]) + (j < pk.length - 1 ? ',' : '')));
    lines.push('}}' + (i < evNames.length - 1 ? ',' : ''));
  }
});
lines.push('},', '"screens":{');
const sk = Object.keys(screens);
sk.forEach((r, i) => lines.push(J(r) + ':' + J(screens[r]) + (i < sk.length - 1 ? ',' : '')));
lines.push('},', '"places":{');
const pl = Object.keys(PLACES);
pl.forEach((k, i) => lines.push(J(k) + ':' + J(PLACES[k]) + (i < pl.length - 1 ? ',' : '')));
lines.push('}', '}');
const text = lines.join('\n') + '\n';
const parsed = JSON.parse(text);
if (J(parsed) !== J(out)) { console.error('Interní chyba: formátovaný zápis se liší od dat.'); process.exit(1); }
writeFileSync(OUT, text);

// ---------- Hlášení ----------
const compact = Buffer.from(J(out));
let nValues = 0, nProps = 0;
for (const e of Object.values(ev)) for (const pr of Object.values(e.p)) { nProps++; if (pr.v) nValues += Object.keys(pr.v).length; }
console.log(`Zapsáno ${OUT}`);
console.log(`akcí ${evNames.length} · vlastností ${nProps} · hodnot ${nValues} · obrazovek ${sk.length} · míst ${pl.length} · skupin ${GROUPS.length}`);
console.log(`velikost souboru ${Buffer.byteLength(text)} B · ve stránce (kompaktně) ${compact.length} B · gzip ${gzipSync(compact, { level: 9 }).length} B`);
console.log(`\nČeské popisky s technickými slovy (build, event, props, installId, referrer, utm_) ve zdrojových katalozích: ${techBefore.length}`);
for (const t of techBefore) console.log('  ' + t);
const techAfter = [];
const walkCs = (where, s) => { if (TECH.test(s)) techAfter.push(`${where}: ${s}`); };
for (const [n, e] of Object.entries(ev)) {
  walkCs(n, e.cs);
  for (const [k, pr] of Object.entries(e.p)) { walkCs(`${n}.${k}`, pr.cs); for (const [vk, x] of Object.entries(pr.v || {})) walkCs(`${n}.${k}.${vk}`, x[0]); }
}
for (const [r, x] of Object.entries(screens)) walkCs(`screen ${r}`, x[0]);
console.log(`Po opravách zbývá k ruční opravě: ${techAfter.length}`);
for (const t of techAfter) console.log('  ' + t);
console.log(`\nRučně opravené popisky: ${log.fixed.length}`);
for (const t of log.fixed) console.log('  ' + t);
console.log(`\nDoplněné hodnoty: ${log.added.length}`);
for (const t of log.added) console.log('  ' + t);
console.log(`\nVynechané hodnoty (volný text): ${log.dropped.length}`);
for (const t of log.dropped) console.log('  ' + t);

if (raw) {
  // Hodnoty z dat, které katalog nezná (bez volného textu a čísel).
  const miss = new Map(), boolMiss = new Set(), unknownEv = new Map(), unknownProp = new Map();
  for (const e of raw) {
    const n = String(e.name);
    if (!Object.hasOwn(ev, n)) { unknownEv.set(n, (unknownEv.get(n) || 0) + 1); continue; }
    for (const [k, val] of Object.entries(e.props || {})) {
      const id = `${n}.${k}`;
      if (!Object.hasOwn(ev[n].p, k)) { unknownProp.set(id, (unknownProp.get(id) || 0) + 1); continue; }
      const pr = ev[n].p[k];
      if (typeof val === 'boolean' && !pr.v) boolMiss.add(id);
      if (!pr.v || pr.f || pr.ref) continue;
      const key = typeof val === 'string' ? val : JSON.stringify(val);
      if (!Object.hasOwn(pr.v, key)) { const m = `${id} = ${JSON.stringify(key)}`; miss.set(m, (miss.get(m) || 0) + 1); }
    }
    if (n === 'screen_view' && e.props && typeof e.props.screen === 'string' && !Object.hasOwn(screens, e.props.screen)) {
      const m = `screen_view.screen = ${JSON.stringify(e.props.screen)}`; miss.set(m, (miss.get(m) || 0) + 1);
    }
  }
  console.log(`\nKontrola proti výpisu (${raw.length} záznamů):`);
  console.log(`  akce mimo katalog: ${unknownEv.size ? [...unknownEv].map(([k, c]) => `${k} (${c}×)`).join(', ') : 'žádné'}`);
  console.log(`  vlastnosti mimo katalog: ${unknownProp.size ? [...unknownProp].map(([k, c]) => `${k} (${c}×)`).join(', ') : 'žádné'}`);
  console.log(`  ano/ne vlastnosti bez hodnot: ${boolMiss.size ? [...boolMiss].join(', ') : 'žádné'}`);
  console.log(`  hodnoty bez popisku: ${miss.size ? '' : 'žádné'}`);
  for (const [m, c] of miss) console.log(`    ${m} (${c}×)`);
  const fromData = Object.entries(ev).filter(([n]) => {
    const e = byName.get(n); const s = parseSince(e.since);
    return !SINCE_FIX[n] && s.sb === null && dataFirst.has(n);
  }).map(([n, x]) => `${n} ${x.sb}`);
  console.log(`  verze (sb) doplněná z dat: ${fromData.join(', ') || 'žádná'}`);
}
