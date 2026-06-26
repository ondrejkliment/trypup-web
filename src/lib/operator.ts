// Zákonná identifikace provozovatele (§ 435 obč. zák. — povinné údaje na obchodních
// materiálech a webu). JEDINÝ ZDROJ PRAVDY — importuje se do patičky (Base.astro)
// i do právních / about stránek (cs + en). Údaje (IČO, adresa, spis. zn.) jsou
// univerzální; lokalizují se jen popisky (viz operatorLabels).
//
// DIČ je zatím prázdné — ve výpisu z OR není (vzniká až registrací k DPH). Jakmile
// se staneš plátcem DPH, vyplň `dic` níže a DIČ se v patičce i na stránkách objeví
// samo (render je podmíněný neprázdnou hodnotou).

export const operator = {
  firma: 'OndysLab s.r.o.',
  pravniForma: {
    cs: 'Společnost s ručením omezeným',
    en: 'Limited liability company (s.r.o.)',
  },
  ico: '29725071',
  dic: '', // doplnit po registraci k DPH (pak se zobrazí automaticky)
  sidlo: 'Korunní 2569/108, Vinohrady, 101 00 Praha 10',
  spisovaZnacka: {
    cs: 'Městský soud v Praze, oddíl C, vložka 450761',
    en: 'Municipal Court in Prague, Section C, Insert 450761',
  },
  email: 'hello@trypup.life',
} as const;

export type Lang = 'cs' | 'en';

/** Lokalizované popisky polí. Hodnoty samotné zůstávají univerzální. */
export function operatorLabels(lang: Lang) {
  return lang === 'en'
    ? {
        operator: 'Operator',
        legalForm: 'Legal form',
        ico: 'Company ID (IČO)',
        dic: 'VAT ID (DIČ)',
        office: 'Registered office',
        registry: 'Commercial register',
        email: 'Email',
        controller: 'Data controller',
      }
    : {
        operator: 'Provozovatel',
        legalForm: 'Právní forma',
        ico: 'IČO',
        dic: 'DIČ',
        office: 'Sídlo',
        registry: 'Zápis v OR',
        email: 'E-mail',
        controller: 'Správce údajů',
      };
}
