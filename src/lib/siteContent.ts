/**
 * Trypup web — registr editovatelných textů/prvků (CMS katalog).
 *
 * JEDINÝ zdroj pravdy o tom, co lze přes /admin/content měnit. Každé pole má
 * stabilní `key`, který je na stránce zapsaný jako `data-cms="key"` (text) nebo
 * `data-cms-href="key"` (odkaz). Hydratace v Base.astro načte přepisy z Firestore
 * `site_content/content` a aplikuje je na elementy s tímto atributem; když přepis
 * neexistuje, zůstane vestavěný text ve stránce (`default` zde slouží editoru jako
 * placeholder / „obnovit na výchozí"). Přidání nového pole = sem doplnit záznam +
 * na stránku přidat `data-cms="<key>"`. Nic víc.
 *
 * Pozn.: upravené textové pole se hydratuje jako prostý text (`textContent`) —
 * případné vnitřní formátování (tučné, barevné zvýraznění) ve výchozím textu
 * zůstává, dokud pole nepřepíšeš; po přepisu je z něj prostý text.
 */

export type CmsFieldType = 'text' | 'textarea' | 'url';

export interface CmsField {
  key: string;
  label: string;
  group: string;
  type: CmsFieldType;
  default: string;
}

export const CMS_FIELDS: CmsField[] = [
  // ─────────────────────────── Domů (CZ) ───────────────────────────
  { key: 'home.cs.hero.badge', group: 'Domů CZ · Hero', type: 'text', label: 'Štítek nad nadpisem', default: '🐾 Edukativní simulátor péče' },
  { key: 'home.cs.hero.title', group: 'Domů CZ · Hero', type: 'text', label: 'Hlavní nadpis', default: 'Pes na zkoušku' },
  { key: 'home.cs.hero.lead', group: 'Domů CZ · Hero', type: 'textarea', label: 'Podnadpis (lead)', default: 'Vyzkoušej si na vlastní kůži, co péče o psa obnáší — dřív, než si pořídíš toho skutečného.' },
  { key: 'home.cs.hero.ctaPrimary', group: 'Domů CZ · Hero', type: 'text', label: 'Tlačítko 1 (text)', default: 'Stáhnout appku' },
  { key: 'home.cs.hero.ctaGhost', group: 'Domů CZ · Hero', type: 'text', label: 'Tlačítko 2 (text)', default: 'Jak to funguje' },

  { key: 'home.cs.stat.big', group: 'Domů CZ · Statistika', type: 'textarea', label: 'Velký výrok', default: 'Až polovina psů v útulcích tam skončí kvůli nepřipravenosti majitelů.' },
  { key: 'home.cs.stat.sub', group: 'Domů CZ · Statistika', type: 'textarea', label: 'Doplněk pod výrokem', default: 'Trypup ti dá šanci to zjistit před rozhodnutím — ne po něm.' },

  { key: 'home.cs.how.title', group: 'Domů CZ · Jak to funguje', type: 'text', label: 'Nadpis sekce', default: 'Jak to funguje' },
  { key: 'home.cs.how.sub', group: 'Domů CZ · Jak to funguje', type: 'text', label: 'Podnadpis sekce', default: 'Tři kroky, jako kdyby ses staral doopravdy.' },
  { key: 'home.cs.how.step1title', group: 'Domů CZ · Jak to funguje', type: 'text', label: 'Krok 1 — tučně', default: 'Vyber plemeno a pojmenuj psa.' },
  { key: 'home.cs.how.step1text', group: 'Domů CZ · Jak to funguje', type: 'text', label: 'Krok 1 — text', default: 'Dotazník ti doporučí, co k tobě sedí.' },
  { key: 'home.cs.how.step2title', group: 'Domů CZ · Jak to funguje', type: 'text', label: 'Krok 2 — tučně', default: 'Starej se každý den.' },
  { key: 'home.cs.how.step2text', group: 'Domů CZ · Jak to funguje', type: 'text', label: 'Krok 2 — text', default: 'Procházky, krmení, výcvik, veterina. Nic se nedá odbýt.' },
  { key: 'home.cs.how.step3title', group: 'Domů CZ · Jak to funguje', type: 'text', label: 'Krok 3 — tučně', default: 'Zjisti pravdu o sobě.' },
  { key: 'home.cs.how.step3text', group: 'Domů CZ · Jak to funguje', type: 'textarea', label: 'Krok 3 — text', default: 'Zvládneš rutinu i ve dnech, kdy se ti nechce? Pokud psa zanedbáš, odejde do útulku — bez následků pro živé zvíře.' },

  { key: 'home.cs.feat.title', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Nadpis sekce', default: 'Co appka umí' },
  { key: 'home.cs.feat.sub', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Podnadpis sekce', default: 'Realistická simulace péče — od procházek po náklady.' },
  { key: 'home.cs.feat1.title', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Karta 1 — nadpis', default: 'GPS procházky' },
  { key: 'home.cs.feat1.text', group: 'Domů CZ · Co appka umí', type: 'textarea', label: 'Karta 1 — text', default: 'Reálné trasy s časem, vzdáleností a anti-cheat kontrolou, že fakt jdeš ven.' },
  { key: 'home.cs.feat2.title', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Karta 2 — nadpis', default: 'Denní péče' },
  { key: 'home.cs.feat2.text', group: 'Domů CZ · Co appka umí', type: 'textarea', label: 'Karta 2 — text', default: 'Krmení, hra, čištění, odpočinek. Statistiky reagují na to, jak se staráš.' },
  { key: 'home.cs.feat3.title', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Karta 3 — nadpis', default: 'Výcvik' },
  { key: 'home.cs.feat3.text', group: 'Domů CZ · Co appka umí', type: 'textarea', label: 'Karta 3 — text', default: '9 povelů s postupným odemykáním. Každé plemeno se učí jinak rychle.' },
  { key: 'home.cs.feat4.title', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Karta 4 — nadpis', default: 'Zdraví & náklady' },
  { key: 'home.cs.feat4.text', group: 'Domů CZ · Co appka umí', type: 'textarea', label: 'Karta 4 — text', default: 'Očkovací kalendář a reálné měsíční i roční náklady na psa.' },
  { key: 'home.cs.feat5.title', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Karta 5 — nadpis', default: 'Vzdělávání' },
  { key: 'home.cs.feat5.text', group: 'Domů CZ · Co appka umí', type: 'textarea', label: 'Karta 5 — text', default: 'Články o adopci, výběru útulku a otázkách, které si polož předem.' },
  { key: 'home.cs.feat6.title', group: 'Domů CZ · Co appka umí', type: 'text', label: 'Karta 6 — nadpis', default: 'Spoluvlastnictví' },
  { key: 'home.cs.feat6.text', group: 'Domů CZ · Co appka umí', type: 'textarea', label: 'Karta 6 — text', default: 'Sdílej péči s rodinou — každý vidí, co udělal ten druhý.' },

  { key: 'home.cs.dl.title', group: 'Domů CZ · Stažení', type: 'text', label: 'Nadpis sekce', default: 'Pes na zkoušku' },
  { key: 'home.cs.dl.sub', group: 'Domů CZ · Stažení', type: 'textarea', label: 'Podnadpis sekce', default: 'Appka brzy v App Store a Google Play. Zatím se mrkni, o co jde.' },
  { key: 'home.cs.dl.ctaPrimary', group: 'Domů CZ · Stažení', type: 'text', label: 'Tlačítko 1 (text)', default: 'O aplikaci' },
  { key: 'home.cs.dl.ctaGhost', group: 'Domů CZ · Stažení', type: 'text', label: 'Tlačítko 2 (text)', default: 'Číst blog' },

  // ─────────────────────────── Domů (EN) ───────────────────────────
  { key: 'home.en.hero.badge', group: 'Domů EN · Hero', type: 'text', label: 'Badge', default: '🐾 Educational care simulator' },
  { key: 'home.en.hero.title', group: 'Domů EN · Hero', type: 'text', label: 'Headline', default: 'A dog on trial' },
  { key: 'home.en.hero.lead', group: 'Domů EN · Hero', type: 'textarea', label: 'Lead', default: 'Feel for yourself what caring for a dog really takes — before you get a real one.' },
  { key: 'home.en.hero.ctaPrimary', group: 'Domů EN · Hero', type: 'text', label: 'Button 1', default: 'Get the app' },
  { key: 'home.en.hero.ctaGhost', group: 'Domů EN · Hero', type: 'text', label: 'Button 2', default: 'How it works' },

  { key: 'home.en.stat.big', group: 'Domů EN · Stat', type: 'textarea', label: 'Big statement', default: 'Up to half of all shelter dogs end up there because their owners weren\'t prepared.' },
  { key: 'home.en.stat.sub', group: 'Domů EN · Stat', type: 'textarea', label: 'Sub', default: 'Trypup lets you find out before the decision — not after.' },

  { key: 'home.en.how.title', group: 'Domů EN · How it works', type: 'text', label: 'Section title', default: 'How it works' },
  { key: 'home.en.how.sub', group: 'Domů EN · How it works', type: 'text', label: 'Section sub', default: 'Three steps, just like caring for a real dog.' },
  { key: 'home.en.how.step1title', group: 'Domů EN · How it works', type: 'text', label: 'Step 1 — bold', default: 'Pick a breed and name your dog.' },
  { key: 'home.en.how.step1text', group: 'Domů EN · How it works', type: 'text', label: 'Step 1 — text', default: 'A questionnaire recommends what fits you.' },
  { key: 'home.en.how.step2title', group: 'Domů EN · How it works', type: 'text', label: 'Step 2 — bold', default: 'Care for it every day.' },
  { key: 'home.en.how.step2text', group: 'Domů EN · How it works', type: 'text', label: 'Step 2 — text', default: 'Walks, feeding, training, vet. Nothing can be skipped.' },
  { key: 'home.en.how.step3title', group: 'Domů EN · How it works', type: 'text', label: 'Step 3 — bold', default: 'Learn the truth about yourself.' },
  { key: 'home.en.how.step3text', group: 'Domů EN · How it works', type: 'textarea', label: 'Step 3 — text', default: 'Can you keep the routine even on days you don\'t feel like it? Neglect the dog and it goes to a shelter — with no consequences for a living animal.' },

  { key: 'home.en.feat.title', group: 'Domů EN · What it does', type: 'text', label: 'Section title', default: 'What the app does' },
  { key: 'home.en.feat.sub', group: 'Domů EN · What it does', type: 'text', label: 'Section sub', default: 'A realistic care simulation — from walks to costs.' },
  { key: 'home.en.feat1.title', group: 'Domů EN · What it does', type: 'text', label: 'Card 1 — title', default: 'GPS walks' },
  { key: 'home.en.feat1.text', group: 'Domů EN · What it does', type: 'textarea', label: 'Card 1 — text', default: 'Real routes with time, distance and an anti-cheat check that you actually went out.' },
  { key: 'home.en.feat2.title', group: 'Domů EN · What it does', type: 'text', label: 'Card 2 — title', default: 'Daily care' },
  { key: 'home.en.feat2.text', group: 'Domů EN · What it does', type: 'textarea', label: 'Card 2 — text', default: 'Feeding, play, grooming, rest. Stats react to how well you care.' },
  { key: 'home.en.feat3.title', group: 'Domů EN · What it does', type: 'text', label: 'Card 3 — title', default: 'Training' },
  { key: 'home.en.feat3.text', group: 'Domů EN · What it does', type: 'textarea', label: 'Card 3 — text', default: '9 commands with progressive unlocks. Each breed learns at its own pace.' },
  { key: 'home.en.feat4.title', group: 'Domů EN · What it does', type: 'text', label: 'Card 4 — title', default: 'Health & costs' },
  { key: 'home.en.feat4.text', group: 'Domů EN · What it does', type: 'textarea', label: 'Card 4 — text', default: 'Vaccination schedule and realistic monthly and yearly dog costs.' },
  { key: 'home.en.feat5.title', group: 'Domů EN · What it does', type: 'text', label: 'Card 5 — title', default: 'Education' },
  { key: 'home.en.feat5.text', group: 'Domů EN · What it does', type: 'textarea', label: 'Card 5 — text', default: 'Articles on adoption, choosing a shelter and the questions to ask yourself first.' },
  { key: 'home.en.feat6.title', group: 'Domů EN · What it does', type: 'text', label: 'Card 6 — title', default: 'Co-ownership' },
  { key: 'home.en.feat6.text', group: 'Domů EN · What it does', type: 'textarea', label: 'Card 6 — text', default: 'Share care with family — everyone sees what the other one did.' },

  { key: 'home.en.dl.title', group: 'Domů EN · Get', type: 'text', label: 'Section title', default: 'A dog on trial' },
  { key: 'home.en.dl.sub', group: 'Domů EN · Get', type: 'textarea', label: 'Section sub', default: 'Coming soon to the App Store and Google Play. For now, take a look at what it\'s about.' },
  { key: 'home.en.dl.ctaPrimary', group: 'Domů EN · Get', type: 'text', label: 'Button 1', default: 'About the app' },
  { key: 'home.en.dl.ctaGhost', group: 'Domů EN · Get', type: 'text', label: 'Button 2', default: 'Read the blog' },

  // ─────────────────────────── O aplikaci (CZ) ───────────────────────────
  { key: 'about.cs.title', group: 'O aplikaci CZ', type: 'text', label: 'Nadpis', default: 'O aplikaci' },
  { key: 'about.cs.meta', group: 'O aplikaci CZ', type: 'text', label: 'Meta řádek', default: 'Pes na zkoušku · zodpovědné rozhodnutí' },
  { key: 'about.cs.intro', group: 'O aplikaci CZ', type: 'textarea', label: 'Úvodní odstavec', default: 'Trypup je edukativní simulátor péče o psa pro dospělé, kteří vážně uvažují o pořízení skutečného psa. Cílem je snížit počty psů v útulcích tím, že lidi přiměje přemýšlet PŘED rozhodnutím — ne po něm.' },
  { key: 'about.cs.whyTitle', group: 'O aplikaci CZ', type: 'text', label: 'Nadpis „Proč vznikl"', default: 'Proč Trypup vznikl' },
  { key: 'about.cs.whyText', group: 'O aplikaci CZ', type: 'textarea', label: 'Text „Proč vznikl"', default: 'Polovina psů v útulcích tam skončí proto, že majitelé nepočítali s tím, co péče opravdu obnáší — čas, peníze, výdrž. Trypup tě tou rutinou provede nanečisto, bez následků pro živé zvíře.' },
  { key: 'about.cs.breedsTitle', group: 'O aplikaci CZ', type: 'text', label: 'Nadpis „Plemena"', default: 'Plemena' },
  { key: 'about.cs.breedsText', group: 'O aplikaci CZ', type: 'textarea', label: 'Text „Plemena"', default: 'Tři základní plemena zdarma (jedno od každého vzrůstu — malé, střední, velké) a další jako Premium (Border kolie, Sibiřský husky, Německý ovčák, Zlatý retrívr, Bernský salašnický pes a další).' },
  { key: 'about.cs.commitTitle', group: 'O aplikaci CZ', type: 'text', label: 'Nadpis „Náš závazek"', default: 'Náš závazek' },
  { key: 'about.cs.commitText', group: 'O aplikaci CZ', type: 'textarea', label: 'Text „Náš závazek"', default: 'Část výnosů věnujeme partnerským útulkům. Trypup není hra na výhru — je to upřímná zkouška, jestli na psa máš.' },
  { key: 'about.cs.cta', group: 'O aplikaci CZ', type: 'text', label: 'Tlačítko dole', default: 'Vyzkoušet Trypup' },

  // ─────────────────────────── O aplikaci (EN) ───────────────────────────
  { key: 'about.en.title', group: 'O aplikaci EN', type: 'text', label: 'Title', default: 'About the app' },
  { key: 'about.en.meta', group: 'O aplikaci EN', type: 'text', label: 'Meta line', default: 'A dog on trial · a responsible decision' },
  { key: 'about.en.intro', group: 'O aplikaci EN', type: 'textarea', label: 'Intro paragraph', default: 'Trypup is an educational dog-care simulator for adults seriously considering getting a real dog. The goal is to reduce the number of dogs in shelters by getting people to think BEFORE the decision — not after.' },
  { key: 'about.en.whyTitle', group: 'O aplikaci EN', type: 'text', label: '„Why" title', default: 'Why Trypup exists' },
  { key: 'about.en.whyText', group: 'O aplikaci EN', type: 'textarea', label: '„Why" text', default: 'Half of all shelter dogs end up there because their owners didn\'t realize what care really takes — time, money, stamina. Trypup walks you through that routine as a dry run, with no consequences for a living animal.' },
  { key: 'about.en.breedsTitle', group: 'O aplikaci EN', type: 'text', label: '„Breeds" title', default: 'Breeds' },
  { key: 'about.en.breedsText', group: 'O aplikaci EN', type: 'textarea', label: '„Breeds" text', default: 'Three starter breeds free (one of each size — small, medium, large) and more as Premium (Border Collie, Siberian Husky, German Shepherd, Golden Retriever, Bernese Mountain Dog and others).' },
  { key: 'about.en.commitTitle', group: 'O aplikaci EN', type: 'text', label: '„Commitment" title', default: 'Our commitment' },
  { key: 'about.en.commitText', group: 'O aplikaci EN', type: 'textarea', label: '„Commitment" text', default: 'We donate a share of revenue to partner shelters. Trypup isn\'t a game you win — it\'s an honest test of whether you\'re ready for a dog.' },
  { key: 'about.en.cta', group: 'O aplikaci EN', type: 'text', label: 'Bottom button', default: 'Try Trypup' },

  // ─────────────────────────── Společné (lišta) ───────────────────────────
  { key: 'common.cs.announce', group: 'Společné · Oznamovací lišta', type: 'text', label: 'Lišta nahoře (CZ) — text před odkazem', default: '🚧 Trypup je ve vývoji — spustíme už brzy. Sleduj ' },
  { key: 'common.en.announce', group: 'Společné · Oznamovací lišta', type: 'text', label: 'Lišta nahoře (EN) — text před odkazem', default: '🚧 Trypup is in development — launching soon. Follow ' },
  { key: 'common.social.instagram', group: 'Společné · Odkazy', type: 'url', label: 'Instagram URL (lišta)', default: 'https://www.instagram.com/trypupapp/' },
];

/** Mapa key → default (rychlý lookup pro editor / fallback). */
export const CMS_DEFAULTS: Record<string, string> = Object.fromEntries(
  CMS_FIELDS.map((f) => [f.key, f.default]),
);
