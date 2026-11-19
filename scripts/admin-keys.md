# Klíče výpočtů adminu (Získávání, Cesta, Technika)

Schéma výstupu referenčního výpočtu `scripts/admin-reference.py` (SPEC G.1) a zároveň smlouva pro jádro adminu (`computeAcquisition`, `computeJourney`, `computeTech` v `admin.astro`, SPEC C.5). Jádro vrací **stejné klíče se stejnými hodnotami**; `scripts/check-admin-core.mjs` je porovná (SPEC G.2).

```
python3 -I scripts/admin-reference.py <demo.json> [--campaigns <ad_campaigns.json>] > ref.json
```

Výpis zařízení (`demo.json`) ani `ref.json` se nikdy necommitují.

## 1. Společná pravidla

| Pojem | Definice | SPEC |
|---|---|---|
| teď (`NOW`) | `meta.dumpedAt` výpisu v ms; v produkci `Date.now()`. | R4 |
| období N dní | interval (teď − N × 24 h, teď]. Ledgerové časy i časy událostí. | R4 |
| pražský den | kalendářní den v Europe/Prague (`pragueDay`, jako server). Dnešek = pražský den teď. Výstup jako ISO `YYYY-MM-DD`. | R4, C.5 |
| skutečné zařízení | záznam ledgeru `install_platforms` s `platform` `ios`/`android` a `classifyInstall(...).kind === 'real'` (ruční přepis `tester_installs` má přednost; přepis bez `kind` = tester). | R1, `installClass.js` |
| události zařízení | záznamy z `RAW` po deduplikaci, jen skutečná zařízení, jen s číselným `ts`, seřazené podle `ts` stabilně (při shodě pořadí ve výpisu). Zařízení mimo ledger se nepočítají. | R1, R3 |
| deduplikace | klíč `installId + name + ts + props` (props se seřazenými klíči, rekurzivně); první výskyt zůstává. Platí pro celý `RAW` (všechna zařízení). | R3 |
| noví za N | skutečná zařízení s ledger `firstMs` v období N. | R5 |
| aktivní za N | skutečná zařízení s ledger `lastMs` v období N. | R5 |
| událost v období | `ts` v období; signály režimů a funkcí se berou jen z událostí v období. | R5 |
| číslo | jen JSON číslo, konečné (`typeof v === 'number' && Number.isFinite(v)`); řetězec, bool a `null` nejsou číslo. Na dnešních datech jsou všechna `ts`, `appBuild`, `dwellMs`, `day` celá čísla. | R12 |
| verze zařízení v okně | nejvyšší číselné `dev.appBuild` z událostí zařízení v daném okně; bez událostí 0. | R8 |
| zralost (R6) | „aspoň 2 různé dny“: zařízení, které funkci (režim) v období použilo poprvé nejpozději teď − 7 × 24 h; z nich ti, kdo ji v období použili aspoň ve 2 různých pražských dnech. | R6 |
| měřitelnost (R8) | Y = základ, X = zařízení základu s verzí v okně ≥ `sb`. `X × 100 ≥ 90 × Y` → základ zůstává Y; jinak `X × 10 < Y` nebo `X < 10` → neměříme; jinak základ = těch X. | R8 |
| klíč hodnoty | `String()` hodnoty z dat; `null`, chybějící a `''` → `_none`; celé číslo bez `.0`; bool `true`/`false`. Klíče jsou technické, popisky řeší vykreslení. | – |
| zlomek | `{"k": int, "n": int}`; procento se nevrací (počítá ho vykreslení z k a n). | R7 |
| zlomek s R8 | `{"k", "n", "x", "y"}`; `n == y` = bez zúžení, `n == x < y` = „měřitelné u X z Y“. Neměřitelné: `{"state": "unmeasured", "x", "y"}`. | R8 |
| rozpad | `[[klíč, počet], …]` sestupně podle počtu, při shodě vzestupně podle klíče (porovnání řetězců po znacích); nulové řádky se nevypisují. | – |
| verdikt | řetězec ze slovníku C.0; navíc `Jen počty` (B6, C0 bod 5). | C.0 |
| R7 srovnání (`compare(a, b)`) | `min(a.n, b.n) < 10` → `Málo dat`; obě `n ≥ 30` a `abs(z) ≥ 1.96` → `Průkazný rozdíl`; jinak `Zatím neprůkazné`. `z` = test dvou podílů se sdruženým podílem; nulová chyba nebo prázdná skupina → `z = 0`. | R7 |
| Wilson | 95 % (z = 1,96), rozpětí oříznuté na [0, 1]. | R7, A4 |
| kdy bude jasno (`whenClear`) | základ ≥ 30 → `null`; přibylo do základu za 7 dní = 0 → `{"state": "unknown"}`; jinak `days = ⌈(30 − základ) × 7 / přibylo⌉`, `date` = dnešek + days (ISO), `part` = `start` (dny 1–10) / `mid` (11–20) / `end` (21–31). Ze dvou a víc vyhrává pozdější, neznámé má přednost. | C.0 |
| desetinná čísla | jen `z`, `perDay`, `above`, `cost`, `spendEur` (součet) a `dwell.*.ms`; zaokrouhlení `Math.round(x × 10^d) / 10^d` (z: 3 místa, perDay: 4, ostatní: 2), celé číslo bez `.0`. Kontrola v Node je porovná s tolerancí 1 jednotky posledního místa; `dwell.*.ms` je přesný medián (sudý počet = průměr dvou prostředních). | – |
| `state` | `missing` = data nejsou (dokument chybí), `unmeasured` = verze, která to posílá, nemá dost zařízení (R8), `testers` = funkce jen pro testery, `unknown` = odhad nejde. | R7 |

`meta.*` je informační a kontrola jádra ho neporovnává.

## 2. `meta`

| Klíč | Význam |
|---|---|
| `meta.now`, `meta.nowMs`, `meta.today` | teď (ISO z výpisu, ms, pražský den). |
| `meta.cohortFrom`, `meta.cohortTo` | pražský den teď − 30 × 24 h a dnešek (hlavička Cesty „Noví = první spuštění {od}–{do}“). |
| `meta.realDevices` | počet skutečných zařízení v ledgeru. |
| `meta.campaignsDoc` | byl předán zápis kampaní (`--campaigns` nebo `AD_CAMPAIGNS` ve výpisu). |
| `meta.catalogDiff` | rozdíly mezi katalogem reference a `src/data/admin-labels.json` (`g`, `sb`, `od`, `st`, `auto`); `[]` = shoda, `null` = katalog adminu neexistuje. |
| `meta.schema` | verze schématu (1). |

## 3. `acq` – Získávání (SPEC C.1)

| Klíč | Význam a definice | SPEC |
|---|---|---|
| `acq.new.{h24,d7,prev7,d30}.{all,ios,android}` | noví za 24 h / 7 dní / předchozích 7 dní (interval (teď − 14 d, teď − 7 d]) / 30 dní, celkem a po platformě. | Z1, R5 |
| `acq.trend` | `Roste` / `Klesá`, když `abs(d7 − prev7) ≥ 5` a `abs(d7 − prev7) × 100 ≥ 20 × prev7`; jinak `Drží` (počítá se `all`). Totéž jako `acq.verdicts.z1`. | Z1, TREND_* |
| `acq.byDay[]` | 30 pražských dnů chronologicky (dnes − 29 … dnes). `day`; `all`/`ios`/`android` = skuteční noví, jejichž pražský den `firstMs` je ten den (celý den, i když leží částečně mimo okno 30 × 24 h); `partial` = dnešek; `store.ios` = součet `firstTime` dokumentů `store_stats` iOS s `date` = den, `store.android` = součet `installs`; `null`, když je den po `store.lastDay` platformy (čeká na data), jinak číslo (den bez dokumentu = 0); `campaign` = platformy v pořadí `android`, `ios`, na kterých podle zápisu kampaní ten den běžela kampaň (`from ≤ den ≤ to`, `to: null` = běží dál), bez zápisu `[]`. | Z1, Z3 |
| `acq.store.lastDay.{ios,android}` | nejvyšší `date` dokumentů platformy ve `store_stats`, `null` bez dat. | Z1 |
| `acq.channel.of` | noví Android za 30 dní. | Z2 |
| `acq.channel.measured` | z nich ti, kdo mají v ledgeru neprázdný `srcChannel` nebo verzi v 30denním okně ≥ 352. | Z2 |
| `acq.channel.byChannel` | rozpad měřitelných podle klíče `srcChannel` (měřitelný bez kanálu → `_none`). | Z2 |
| `acq.channel.unmeasured` | `of − measured` („Verze bez měření zdroje“). | Z2 |
| `acq.channel.ios` | noví iPhone za 30 dní (zdroj od Applu v adminu není). | Z2 |
| `acq.quality.all` | řádek kvality pro všechny nové za 30 dní (tvar níže). | Z4 |
| `acq.quality.channel.<kanál>` | řádek kvality pro měřitelné nové Android za 30 dní s tím kanálem (všechny kanály z `byChannel`). | Z4 |
| řádek kvality `{n, active10, otherDay, d1, dog}` | `n` = počet zařízení; `active10` = `lastMs − firstMs ≥ 10 min`; `otherDay` = pražský den `lastMs` > pražský den `firstMs`; `d1` = `cohortRetention(...).all.d1` těchto zařízení (jen zralí, zrcadlo serveru); `dog` = má kdykoli `activated`, `owner_activated` nebo obrazovku `pesdoma/dog/*`. Všechny zlomky mají základ `n` kromě `d1`. | Z4 |
| `acq.quality.campaign` | `null` bez zápisu kampaní; jinak `{<platforma>: {in, out}}` pro každou platformu s kampaní: řádky kvality nových za 30 dní té platformy, jejichž pražský den `firstMs` je (`in`) / není (`out`) dnem běžící kampaně na té platformě. | Z4 |
| `acq.quality.comparisons[]` | `{group, eligible, a, b, verdict, z}`. Pro každý kanál `group: "channel:<kanál>"`, `a` = D1 kanálu, `b` = D1 ostatních nových za 30 dní (všichni noví 30 kromě kanálu), `eligible` = kanál má aspoň 30 zařízení. Pro každou platformu s kampaní `group: "campaign:<platforma>"`, `a` = D1 `in`, `b` = D1 `out`, `eligible: true`. `verdict`, `z` = R7 srovnání `a` × `b`. | Z4, R7 |
| `acq.quality.topChannel` | `{key, devices}` kanál s nejvíc měřitelnými zařízeními (shoda podle klíče), `null` bez měřitelných. | Z4 věta |
| `acq.campaigns` | bez zápisu `{"state": "missing"}`; se zápisem `{state: "ok", updatedAt, list, joint}`. | Z3 |
| `acq.campaigns.list[]` | za každou platnou kampaň (platforma `ios`/`android`, platné `from`) v pořadí vstupu: `id`, `name`, `network`, `platform`, `from`, `to`; `days` = počet pražských dnů od `from` do min(`to`, včera); `new` = skuteční noví platformy s pražským dnem `firstMs` v těch dnech; `baseline` = běžný stav (níže); `above` = `new − baseline.devices × days / baseline.days` (`null` bez běžného stavu); `spendEur` (číslo nebo `null`); `spendAt`; `cost` = `spendEur / above`, jen když `above > 0` a útrata je číslo, jinak `null`; `verdict`; `note` = `nothingExtra` (nic navíc, `above ≤ 0`), `noBaseline` (běžný stav nejde určit) nebo `null`; `tight` = verdikt `Vyplatí se`/`Nevyplatí se` a `4.5 ≤ cost ≤ 5.5`; `group` = `id` první kampaně (ve vstupu) skupiny překrývajících se kampaní, `null` u samostatné. | Z3 |
| `baseline` | dny = z 14 pražských dnů před `from` ty, kdy na stejné platformě neběžela žádná zapsaná kampaň (`from ≤ den ≤ to`, `to: null` = běží dál); `{days, devices, perDay}` (`devices` = noví platformy v těch dnech); méně než 4 dny → `{"state": "missing", days, devices}`. | Z3 |
| verdikt kampaně | v tomto pořadí: `days < 3` → `Běží krátce`; útrata není číslo → `Chybí útrata`; kampaň je ve skupině překryvu → `Nelze oddělit`; běžný stav chybí → `Málo dat` (`note: noBaseline`, věta „Nelze určit běžný stav“); `above ≤ 0` → `Nevyplatí se` (`note: nothingExtra`); `cost ≤ 5` → `Vyplatí se`; jinak `Nevyplatí se`. | Z3 |
| překryv | dvě kampaně stejné platformy, jejichž rozsahy `from`–`to` (`to: null` = bez konce) mají společný den; skupina = souvislá složka překryvů. | Z3 |
| `acq.campaigns.joint[]` | pro každou skupinu překryvu: `group`, `ids` (pořadí vstupu), `platform`, `days` = sjednocení započtených dnů kampaní skupiny, `new`, `baseline` (vůči nejmenšímu `from` skupiny), `above`, `spendEur` = součet (`null`, když některé chybí), `cost` („Společně: {útrata} € / {nad} zařízení = {cena} €“). | Z3 |
| `acq.share.active` | aktivní za 30 dní (základ Z5). | Z5 |
| `acq.share.shared` | `{k: aktivní se share_initiated v období, n: active}`. | Z5 |
| `acq.share.kind` | rozpad sdílejících podle `props.kind` (zařízení; zařízení s víc momenty je v každém); UI ukáže prvních 5. | Z5 |
| `acq.share.ios.shared`, `acq.share.ios.sent` | sdílející iPhony; aktivní iPhony s `share_completed` a `action: shared` v období. | Z5 |
| `acq.share.coop.invited`, `acq.share.coop.joined` | aktivní s `coop_invite_created` / `coop_joined` v období. | Z5 |
| `acq.share.link` | aktivní za 30 dní s ledger `srcChannel = trypup_link`. | Z5 |
| `acq.share.family` | `{"state": "testers"}` („zatím jen testeři“). | Z5 |
| `acq.region`, `acq.locale`, `acq.deviceLocale` | rozpad nových za 30 dní podle ledger `region` / `locale` / `deviceLocale`; `null`, `''`, `none`, `unknown` → `_none` („bez údaje“). | Z6 |
| `acq.storeRegion30` | rozpad součtu `byTerritory` (iOS) a `byCountry` (Android) dokumentů `store_stats` s `date` v posledních 30 pražských dnech (dnes − 29 … dnes); jen číselné hodnoty. | Z6 |
| `acq.verdicts.{z1…z6}` | verdikty karet: `z1` = `acq.trend`; `z2` = `Zjištění`, pod 10 měřitelných `Málo dat`; `z3` = bez zápisu `Chybí útrata`, jinak verdikt nejnovější kampaně (největší `from`, při shodě pozdější ve vstupu); `z4` = mezi `comparisons` s `eligible` nějaký `Průkazný rozdíl` → ten, jinak nějaký `Zatím neprůkazné` → ten, jinak `Málo dat`; `z5`, `z6` = `Zjištění`. | C.1 |
| `acq.whenClear.z4` | jen když `z4` není `Průkazný rozdíl`: s `eligible` srovnáními pozdější z obou stran každého srovnání (základ = D1 n strany, přibylo = zařízení strany, jejichž den `firstMs` + 2 ∈ [dnes − 6, dnes]); bez nich podle `topChannel` (D1 základ a přibylí toho kanálu); bez kanálů `{"state": "unknown"}`. | C.0 |

## 4. `jr` – Cesta (SPEC C.2)

Kohorta K = noví za 30 dní. Krok úvodu „dosáhl“ = `onboarding_step` s `step` = krok a `dir` ≠ `back`. Poslední volba = `choice` posledního `onboarding_step` s neprázdným `choice` (všechny události zařízení).

| Klíč | Význam a definice | SPEC |
|---|---|---|
| `jr.cohort` | počet K. | A1 |
| `jr.onb`, `jr.noOnb` | z K s aspoň jedním `onboarding_step` (kdykoli); zbytek. | A1 |
| `jr.fork.n` | z `onb` s krokem `fork` nebo neprázdným `choice`. | A1 |
| `jr.fork.choice` | rozpad `fork.n` podle poslední volby. | A1 |
| `jr.branch.trial.entered` | prošli úvodem a poslední volba ≠ `owner` (i starý úvod bez rozcestí). | A1 |
| `jr.branch.trial.{quiz,quiz_result,name}` | z větve dosáhli kroku. | A1 |
| `jr.branch.trial.activated` | z větve mají `activated` kdykoli („Pes založen“). | A1 |
| `jr.branch.owner.entered` | prošli úvodem a poslední volba = `owner`. | A1 |
| `jr.branch.owner.owner_setup` | z větve dosáhli kroku `owner_setup`. | A1 |
| `jr.branch.owner.saved` | z větve „Pes uložen“ = `owner_activated` nebo obrazovka `pesdoma/dog/*`, kdykoli. | A1 |
| `jr.branch.owner.savedEvent` | z větve jen `owner_activated`. | A1 |
| `jr.branch.owner.notSaved`, `jr.branch.owner.closed` | `entered − saved`; z nich s `owner_setup_exit` kdykoli. | A1 |
| `jr.dogAny` | `{k: z K s activated nebo „Pes uložen“, n: cohort}`. | A1 |
| `jr.noDog` | rozpad K bez psa (podle `dogAny`) podle `step` posledního `onboarding_step` (i s `dir: back`); bez kroku `_none`. | A2 |
| `jr.dwell.<fromStep>` | `{n, ms, s}`: záznamy `onboarding_step` zařízení z K bez `dir: back` s číselným `dwellMs` a neprázdným `fromStep`; jen kroky s `n ≥ 10`; `ms` = medián, `s` = `Math.round(ms / 1000)`. | A2, R10 |
| `jr.back.devices` | z K se záznamem `onboarding_step` s `dir: back`. | A2 |
| `jr.back.transitions` | rozpad záznamů s `dir: back` podle `"{fromStep}>{step}"` (prázdná strana `?`); počty přechodů, ne zařízení. | A2 |
| `jr.week.mature` | z K s `firstMs ≤ teď − 7 × 24 h`. | A3, R6 |
| `jr.week.trial`, `jr.week.owner` | zralí ve větvi zkoušky s `activated`; zralí ve větvi domova s „Pes uložen“. | A3 |
| týden zařízení | události zařízení s `ts ≤ firstMs + 7 × 24 h` (bez dolní meze). R8 v A3 bere verzi z tohoto týdne. | A3 |
| `jr.week.trialUse.care` / `care2` / `care3` | `task_done` v týdnu aspoň v 1 / 2 / 3 různých pražských dnech (základ `week.trial`). | A3 |
| `jr.week.trialUse.challenge` | `challenge_started` v týdnu. | A3 |
| `jr.week.trialUse.notif` | zlomek s R8 (`sb` 288): `notification_permission` se `status: granted` v týdnu. | A3 |
| `jr.week.ownerUse.plan` | obrazovka `pesdoma/dog/[id]/plan` v týdnu (základ `week.owner`). | A3 |
| `jr.week.ownerUse.diary` | obrazovka `pesdoma/dog/[id]/diary`, `…/entry` nebo `…/weight` v týdnu. | A3 |
| `jr.week.ownerUse.returned` | obrazovky `pesdoma/*` v týdnu aspoň ve 2 pražských dnech. | A3 |
| `jr.week.ownerUse.planItem` | zlomek s R8 (`sb` 337): `plan_item` v týdnu. | A3, R8 |
| `jr.ret.<segment>` | `computeRetention` nad K (zrcadlo `cohortRetention.js`): segmenty `all`, `challenge`, `trial`, `owner`, `notActivated`; každý `{installs, d1, d7, d30, w1, w4}`; dny aktivity a příznaky segmentu ze všech událostí zařízení. | A4, C.5 |
| `jr.retMarket.d1Range` | Wilson 95 % pro `ret.all.d1` v celých procentech `[Math.round(100 × dolní), Math.round(100 × horní)]`; `null` při `n = 0`. | A4 |
| `jr.ab.variants.<varianta>` | `experiment_assigned` s `name: first_care` a `ts ≥` pražská půlnoc 16. 11. 2026 (první takový záznam zařízení, bez omezení 30 dny): `assigned` zařízení; `d1` = `ret.all.d1` těchto zařízení; `tapped` = s `home_banner` `kind: first_care`, `action: tap` (kdykoli); `review` = z nich na seznamu `tech.review`. | A5 |
| `jr.ab.review` | součet `review` přes varianty. | A5 |
| `jr.modes.active` | aktivní za 30 dní. | B1 |
| `jr.modes.{trial,owner,both,neither}` | aktivní se signálem Psa na zkoušku / Psa doma v období (definice signálů B1), v obou, v žádném. | B1 |
| `jr.modes.twoDays.{trial,owner}` | R6 nad signálem režimu (základ = zralí v režimu). | B1, R6 |
| `jr.modes.twoDays.z` | z srovnání `trial` × `owner`. | B1, R7 |
| `jr.trialUse.base` | `modes.trial`. | B2 |
| `jr.trialUse.<řádek>.used` | `{k: zařízení základu se shodou v období, n: base}`. Řádky: `care` `task_done`; `training` `training_done`; `walk` `walk_started` bez `mode: owner` nebo obrazovka `walk`; `walkGps` `walk_completed` bez `mode: owner`; `learning` `article_opened`, `article_read`, `lesson_answered`, `myth_answered`, `review_answered` bez `mode: owner`; `event` `event_choice`; `challenge` `challenge_started`; `day7` `day_advanced` s číselným `day ≥ 7`; `shelter` `fail_state`. | B2 |
| `jr.trialUse.<řádek>.twoDays` | R6 pro řádky `care`, `training`, `walk`, `walkGps`, `learning`, `event` (ostatní klíč nemají: „jednou za výzvu“, „výsledek“). | B2, R6 |
| `jr.trialUse.failChoice` | rozpad zařízení základu podle `choice` záznamů `fail_state_choice` v období (zařízení s víc volbami je v každé). | B2 |
| `jr.owner.base` | `modes.owner`. | B3 |
| `jr.owner.opened.<místo>` | zařízení základu, kterým se v období ukázala obrazovka místa. Místa: `plan` `pesdoma/dog/[id]/plan`; `diary` `…/diary`, `…/entry`, `…/weight`; `docs` `…/passport`, `…/documents`, `…/scan`, `…/summary`; `firstaid` `pesdoma/first-aid`, `pesdoma/first-aid/[topic]`; `training` začíná `pesdoma/dog/[id]/training` nebo `pesdoma/training/`; `vets` `pesdoma/vets`, `pesdoma/vet/[id]` nebo akce `map_opened`; `walk` `pesdoma/walk`, `pesdoma/walk-summary`; `family` `pesdoma/dog/[id]/family`, `pesdoma/family-join` nebo akce `family`. Nepočítá se `pesdoma/setup`, `pesdoma/dog/[id]`, `…/edit`. | B3 |
| `jr.owner.twoDays.<místo>` | R6 pro každé místo (`{0, 0}` = nikdo zralý). | B3, R6 |
| `jr.owner.did.<akce>` | `{place, sb, …zlomek s R8}` nad základem, okno 30 dní: `planItem` `plan_item` (337); `calendar` `calendar_event_opened` (292); `entry` `diary_entry` nebo `weight_entry` (337); `document` `dog_document` (304); `trainingSession` `training_logged` nebo `training_stage_confirmed` (312); `walkStarted` / `walkCompleted` `walk_started` / `walk_completed` s `mode: owner` (338). `family` = `{place: "family", state: "testers"}`. | B3, R8 |
| `jr.switch.total` | aktivní s `mode_switched` v období. | B4 |
| `jr.switch.onboarding.{owner,trial}` | se `source: onboarding` a `to` = `owner` / `trial`. | B4 |
| `jr.switch.later.{owner,trial}` | s jiným zdrojem než `onboarding` a `to` = `owner` / `trial` (zařízení). | B4 |
| `jr.switch.later.{ownerBySource,trialBySource}` | rozpad podle `source` (zařízení na dvojici zdroj × cíl; součet může být větší než celkem). | B4 |
| `jr.entry` | R8 nad aktivními za 7 dní, `sb` 342, verze v 7denním okně: `x`, `y`; neměřitelné `state: "unmeasured"`; jinak `n` = základ, `devices` = ze základu s `app_entry` v 7 dnech, `bySource` = rozpad zařízení podle `source`, `countBySource` = rozpad počtu vstupů. | B5 |
| `jr.notif` | aktivní za 30 dní, poslední `status` `notification_permission` v období: `answered` = zařízení s nějakým záznamem, `granted`, `denied`, `byStatus` = rozpad. | B5 |
| `jr.care` | R8 nad `modes.trial`, `sb` 335, okno 30 dní: `x`, `y`, `n`; `opened` / `done` = ze základu s `care_reminder_opened` / `care_reminder_done` v období (dvě čísla bez podílu); `doneBySlot`, `doneByVariant`, `doneByTiming` = rozpad zařízení se splněním podle `slot` / `variant` / `timing`; `best` jen při verdiktu `Zjištění`. | B5 |
| `jr.mission` | aktivní za 30 dní, zařízení s akcí v období: `started` `challenge_started`, `graduation` `graduation_reached`, `completed` `challenge_completed`, `decided` `challenge_decision`, `decision` = rozpad podle poslední `choice` (`yes`, `not_yet`, `no`, …), `wait` `graduation_wait_cta`; `shelter.devices` = `shelter_opened` nebo `graduation_shelter_cta`, `shelter.clicks` = počet těch záznamů, `shelter.byShelter` = rozpad záznamů podle `shelter` s „ - “ nahrazeným „ – “, prázdný = `_graduation` („z gratulace“), `map` zůstává klíčem. | B6 |
| `jr.answers.readiness` | aktivní za 30 dní, poslední `readiness_completed` v období: `n`, `tier` a `phase` rozpady (`_none` = krok úvodu do 2.2.0), `q.q1…q6.{yes,no,na}`. | B7 |
| `jr.answers.quiz` | poslední `quiz_completed`: `n`, rozpady `hours`, `housing`, `activity`. | B7 |
| `jr.answers.breed` | poslední `breed_selected`: `n`, `matched` (`matchedRecommendation === true`), `other` (`=== false`), `breed` rozpad. | B7 |
| `jr.answers.premiumOffer` | zařízení s `onboarding_premium_offer` `action: shown` / `tapped` v období. | B7 |
| `jr.verdicts.{a1…a5,b1…b6}` | `a1`–`a3`, `b2`–`b4` `Zjištění`; `a4` = `ret.all.d1.n < 30` → `Málo dat`, dolní mez Wilson > 0,26 → `Nad trhem`, horní < 0,26 → `Pod trhem`, jinak `Na úrovni trhu`; `a5` = `Málo dat`, dokud nemají obě varianty `d1.n ≥ 30`, potom R7 srovnání `a` × `b`; `b1` = R7 srovnání `twoDays.trial` × `twoDays.owner`; `b5` = `Zatím neměříme` (péče neměřitelná), `Zatím neprůkazné` (žádná varianta nemá 30 zařízení se splněním), jinak `Zjištění`; `b6` = `Jen počty`. | C.2 |
| `jr.whenClear.{a4,a5,b1,b5}` | `a4` jen při `Málo dat` (základ = `ret.all.d1.n`, přibylo = z K s dnem `firstMs` + 2 ∈ [dnes − 6, dnes]); `a5` při `Málo dat` / `Zatím neprůkazné`: pozdější z variant (D1 základ varianty a její přibylí), méně než 2 varianty → `unknown`; `b1` při `Málo dat` / `Zatím neprůkazné`: pozdější ze skupin pod 30 (přibylo = první signál režimu v období ∈ (teď − 14 d, teď − 7 d]); `b5` při `Zatím neprůkazné`: varianta s nejvíc zařízeními se splněním (základ = její počet, přibylo = z nich s prvním splněním té varianty v období za posledních 7 × 24 h). Jinak `null`. | C.0 |

Signály režimů (B1, v období): **Pes doma** = `screen_view` s `mode: owner` nebo trasou začínající `pesdoma/`; akce `owner_activated`, `owner_setup_exit`, `plan_item`, `diary_entry`, `weight_entry`, `setup_checklist`, `real_reminder_opened`, `training_logged`, `training_stage_confirmed`, `training_help_opened`, `map_opened`, `calendar_event_opened`, `dog_photo`, `dog_document`, `family`; `walk_started` / `walk_completed` s `mode: owner`. **Pes na zkoušku** = akce `activated`, `task_done`, `day_advanced`, `training_done`, `event_choice`, `trip_sitter`, `vet_visit_done`, `challenge_started`, `fail_state`; `screen_view` s trasou `feed`, `play`, `brush`, `training`, `walk`, `walk-summary`, `health`, `(main)/health`, `achievements`, `breeddex`, `breed-select`, `timeline`, `challenge-result`, `graduation`, `fail-state`, nebo `(main)/home` s `mode` ≠ `owner` (i bez `mode`).

## 5. `tech` – Technika (SPEC C.3)

Čísla Techniky odpovídají výchozímu stavu (zaškrtávátko testerů vypnuté): skutečná zařízení. Výjimky: `tech.loaded`, `tech.dupsAll`, `tech.check.unknown`, `tech.check.invalid`, `tech.check.outsideLedger` (všechna načtená zařízení) a `tech.expo` (včetně testerů a robotů).

| Klíč | Význam a definice | SPEC |
|---|---|---|
| `tech.loaded` | `records` = záznamy `RAW` před deduplikací (všechna zařízení), `kept` = po deduplikaci, `dups` = vyřazené, `batches` = načtené dávky (`meta.batches` výpisu), `oldestDay` = pražský den nejstaršího záznamu, `complete` = načtená celá historie. | T1 |
| `tech.dupsAll` | = `loaded.dups`: vyřazené ze všech načtených záznamů (globální čítač C.5). | R3, T1, C.4 bod 7 |
| `tech.dupsAllReal` | vyřazené jen u skutečných zařízení (číslo uvedené v R3 a G.3). | R3 |
| `tech.dups30` | `{k: vyřazené, n: záznamy před deduplikací}` skutečných zařízení v 30denním okně. | T3, T6 |
| `tech.versions7.active` | aktivní za 7 dní. | T2 |
| `tech.versions7.store` | `build` = 325 (verze z obchodu); `devices` = aktivní za 7 dní s verzí v 7denním okně = 325; `oneDay` = z nich se záznamy jen v jednom pražském dni ve 30denním okně. | T2 |
| `tech.versions7.atLeast.<sb>` | aktivní za 7 dní s verzí v 7denním okně ≥ sb, pro 335, 337, 338, 342, 344, 352. | T2 |
| `tech.check.dups30` | `dups30` + `state` (`warn` nad 5 %). | T3 |
| `tech.check.unknown` | názvy odpovídající `^[a-z][a-z0-9_]{0,59}$`, které nejsou v katalogu, ze všech záznamů v 30denním okně (všechna zařízení): `count`, `names` (abecedně, nejvýš 10), `state`. | T3, D.5 |
| `tech.check.invalid` | záznamy v 30denním okně (všechna zařízení) s názvem mimo vzor nebo jiného typu než řetězec: `count`, `state`. | T3, D.5 |
| `tech.check.active30` | `events` = skutečná zařízení s událostí v 30denním okně, `ledger` = aktivní za 30 dní, `state` `warn` při rozdílu nad 2. | T3 |
| `tech.check.outsideLedger` | záznamy v 30denním okně, jejichž `installId` v ledgeru není: `records`, `devices`, `state`. | T3, R1 |
| `tech.check.purchaseNoRc` | `purchase_completed` (bez `product: restore`) skutečných zařízení v 30denním okně, které při párování jako `purchaseRows` (RC nákup ≠ `RENEWAL` ↔ stejný produkt do 10 min, nejbližší nepoužitý, v pořadí `RC_EVENTS`) nedostaly záznam RevenueCatu: `count`, `rows[]` `{day, platform, model, product, iid}` (`iid` = prvních 10 znaků, řazeno podle dne a `iid`), `state`. | T3, T4 |
| `tech.check.d1Server` | `admin` = `cohortRetention` nad všemi skutečnými zařízeními (`all.d1`), `server` = `RETENTION.segments.all.d1` (`null`, když souhrn chybí), `state` `warn` při rozdílu `k` nebo `n` nad 2, `ok`, bez souhrnu `null`. Admin porovnává jen při načtené celé historii (výpis ji má vždy). | T3 |
| `tech.unknown`, `tech.invalid`, `tech.purchaseNoRc` | zkratky `check.unknown.count`, `check.invalid.count`, `check.purchaseNoRc.count`. | G.3 |
| `tech.actions30` | různé platné názvy akcí (vzor D.5, i mimo katalog) v událostech skutečných zařízení v 30denním okně. | G.3, T6 |
| `tech.review` | aktivní za 30 dní, skutečná, bez ručního přepisu, s modelem jako ručně označený tester (přepis s `kind` ≠ `robot`/`real`, model z ledgeru) nebo s `purchaseNoRc`: `active30` počet, `byModel` rozpad, `byReason` rozpad (`testerModel`, `purchaseNoRc`), `rows[]` `{iid, model, firstDay, build (ledger appBuild), reasons}` řazené podle `iid`. | T4 |
| `tech.expo` | `active30` = záznamy ledgeru `ios`/`android` s `lastMs` v 30denním okně **včetně** testerů a robotů; `limit` 1000; `level` `ok` pod 800, `warn` 800–899, `plan` od 900. | T5 |
| `tech.actions.catalog` | akcí v katalogu (93). | T6 |
| `tech.actions.seen30` | akcí katalogu, které mají v 30denním okně aspoň jeden záznam skutečného zařízení. | T6 |
| `tech.actions.unknown30`, `tech.actions.invalid30` | totéž jako `check.unknown` / `check.invalid`, ale jen skutečná zařízení (hlavička T6 se zaškrtávátkem vypnutým). | T6 |
| `tech.actions.dups30` | `dups30.k`. | T6 |
| `tech.actions.rows.<akce>` | každá akce katalogu a každá platná neznámá akce s daty: `g` skupina (`unknown` mimo katalog), `d7` / `d30` = skutečná zařízení se záznamem za 7 / 30 dní, `r30` = záznamů za 30 dní, `sb`, `od` (katalog), `state` v tomto pořadí: `unknown` (mimo katalog), `removed` (`st: removed`), `testers` (`st: testers`), `noData` (`r30 = 0`), `auto` (`auto: 1`), jinak `live`. | T6 |
| `tech.actions.byGroup` | `[[skupina, počet řádků], …]` v pořadí skupin katalogu. | T6 |

## 6. Mapování tabulky SPEC G.3 na klíče

| G.3 | Klíč výstupu |
|---|---|
| `acq.new.h24 / d7 / prev7 / d30` | `acq.new.{h24,d7,prev7,d30}.all` |
| `acq.new.d7.android / ios` · `d30.android / ios` | `acq.new.d7.android` … |
| `acq.trend` | `acq.trend` (= `acq.verdicts.z1`) |
| `acq.byDay` 10.–19. 11. | `acq.byDay[20…29].all` |
| `acq.store.lastDay.ios / android` | `acq.store.lastDay.*` |
| `acq.channel.measured / of`, kanály, `unmeasured`, `ios` | `acq.channel.*`, `acq.channel.byChannel` |
| `acq.quality.all`, `acq.quality.play_organic` | `acq.quality.all`, `acq.quality.channel.play_organic` |
| `acq.campaigns` missing | `acq.campaigns.state = "missing"`, `acq.verdicts.z3 = "Chybí útrata"` |
| `acq.share …` | `acq.share.shared`, `acq.share.kind`, `acq.share.ios`, `acq.share.coop` |
| `acq.region` | `acq.region` |
| `jr.cohort` · `onb` · `noOnb` · `fork` | `jr.cohort`, `jr.onb`, `jr.noOnb`, `jr.fork` |
| `jr.branch.trial` / `jr.branch.owner` | `jr.branch.trial.*`, `jr.branch.owner.*` (uloženo = `saved`, jen událost = `savedEvent`) |
| `jr.dogAny`, `jr.noDog`, `jr.dwell`, `jr.back` | stejné klíče (`jr.dwell.<krok>.s`) |
| `jr.week.*` | `jr.week.{mature,trial,owner}`, `jr.week.trialUse.*`, `jr.week.ownerUse.*` |
| `jr.ret`, `jr.ret.w1` | `jr.ret.<segment>.{d1,d7,w1}` |
| `jr.ret.verdict.d1` | `jr.verdicts.a4` |
| `jr.ab` | `jr.ab.variants.{a,b}.*`, `jr.ab.review` |
| `jr.modes`, `jr.modes.twoDays` | `jr.modes.*` |
| `jr.trialUse`, `.twoDays`, `.failChoice` | `jr.trialUse.<řádek>.used`, `.twoDays`, `jr.trialUse.failChoice` (`revive` = vyzvednutí, `restart` = nový začátek) |
| `jr.owner.opened`, `.twoDays`, `.did` | `jr.owner.opened.*`, `jr.owner.twoDays.*`, `jr.owner.did.*` |
| `jr.switch`, `jr.switch.later` | `jr.switch.*`, `jr.switch.later.ownerBySource`, `.trialBySource` |
| `jr.entry`, `jr.notif`, `jr.care`, `.slot`, `.variant` | `jr.entry`, `jr.notif`, `jr.care`, `jr.care.doneBySlot`, `jr.care.doneByVariant` |
| `jr.mission`, `.decision` | `jr.mission.*` (`yes` = chci psa, `not_yet` = počkám, `no` = není pro mě) |
| `tech.versions7` | `tech.versions7.*` |
| `tech.expo` | `tech.expo.active30` |
| `tech.dups30` · `tech.dupsAll` | `tech.dups30` · `tech.dupsAllReal` (916; `tech.dupsAll` = 1 272 pro všechna načtená zařízení, viz kap. 7) |
| `tech.unknown` · `tech.invalid` · `tech.actions30` | stejné klíče |
| `tech.purchaseNoRc` | `tech.purchaseNoRc`, detail `tech.check.purchaseNoRc.rows` |
| `tech.review` | `tech.review.active30`, `tech.review.byModel` |

## 7. Výklad tam, kde SPEC nebyl jednoznačný

1. **Zdvojené záznamy celkem (R3, G.3 `tech.dupsAll` = 916).** Číslo 916 spočítal `validate_cesta.py` jen u skutečných zařízení. Deduplikace podle C.5 (globální čítač ve `fetchPage`) běží nad všemi záznamy a vyřadí 1 272 z 69 735 (1,8 %); u skutečných zařízení 916 z 51 062 (také 1,8 %). Výstup má obojí: `tech.dupsAll` (všechna, pro T1 a Souhrn) a `tech.dupsAllReal`.
2. **`screen_view` v katalogu** má `sb` 214 / 28. 6. 2026 (stejně jako `admin-labels.json`); hodnota 291 / 23. 10. z D.1 patří vlastnosti `mode` a trasám `pesdoma/*`.
3. **Běžný stav kampaně (Z3)** = dny bez kampaně z okna 14 dnů před `from` (ne 14 nejbližších dnů bez kampaně hledaných libovolně daleko); méně než 4 → „Nelze určit běžný stav“, verdikt `Málo dat` s `note: noBaseline` (ve slovníku verdiktů jiné slovo není).
4. **Dny kampaní pro Z1 a Z4** = `from ≤ den ≤ to` (`to: null` = běží i dnes); cena v Z3 počítá dny jen do včerejška (SPEC Z3).
5. **Verdikt Z4**: srovnání kanálu se počítá jen pro kanál s aspoň 30 zařízeními („bez kanálu s 30 zařízeními Málo dat“); srovnání dnů kampaní se počítá vždy a rozhoduje R7 (od 10 v obou skupinách `Zatím neprůkazné`).
6. **Verdikt Z3 karty** = verdikt nejnovější kampaně; každá kampaň má vlastní verdikt v `list[]`.
7. **A3 a R8**: verze zařízení se bere z jeho prvního týdne (akce musela jít poslat v týdnu, který se měří). Na dnešních datech vychází totéž i s 30denním oknem (0 z 9).
8. **T2 „aktivních jediný den“** = jediný pražský den se záznamy ve 30denním okně (v produkci je načtených 30 dní; nad celou historií výpisu vychází také 51).
9. **B5 připomínky**: SPEC pro verdikt po 30 zařízeních („Nejvíc splnění: varianta N“) nemá test; výstup dá `Zjištění` a `best` = varianta s nejvíc zařízeními.
10. **B6 `Jen počty`** není ve slovníku verdiktů C.0, ale B6 a C0 bod 5 ho výslovně používají.
11. **B3 místa** `vets` a `family` počítají i akce `map_opened` a `family` (SPEC B3), mapování obrazovek v katalogu (`screens[…][2]`) je jen obrazovkové.
12. **`tech.check.unknown` a `invalid`** se počítají ze všech načtených zařízení (kontrola podvržených zápisů), hlavička T6 (`tech.actions.unknown30`, `invalid30`) jen ze skutečných.
13. **Pořadí při stejném `ts`** (poslední volba, poslední krok, poslední stav): stabilní řazení podle `ts`, při shodě pořadí záznamů ve výpisu / `RAW`.
