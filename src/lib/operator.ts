// Zákonná identifikace provozovatele (§ 435 obč. zák. — povinné údaje na obchodních
// materiálech a webu). JEDINÝ ZDROJ PRAVDY — importuje se do patičky (Base.astro)
// i do právních / about stránek (cs + en). Údaje (IČO, adresa, spis. zn.) jsou
// univerzální; lokalizují se jen popisky (viz operatorLabels).
//
// DIČ je zatím prázdné — ve výpisu z OR není (vzniká až registrací k DPH). Jakmile
// se staneš plátcem DPH, vyplň `dic` níže a DIČ se v patičce i na stránkách objeví
// samo (render je podmíněný neprázdnou hodnotou).

// Právní forma a spisová značka jsou v CZ přeloženy do každého jazyka stejně jako
// EN varianta výše (strukturální slova typu "Sekce/Vložka" se překládají, "s.r.o."
// jako typ entity zůstává univerzálně — obdoba mezinárodní praxe u "GmbH"/"Ltd").
export const operator = {
  firma: 'OndysLab s.r.o.',
  pravniForma: {
    cs: 'Společnost s ručením omezeným',
    en: 'Limited liability company (s.r.o.)',
    de: 'Gesellschaft mit beschränkter Haftung (s.r.o.)',
    fr: 'Société à responsabilité limitée (s.r.o.)',
    pl: 'Spółka z ograniczoną odpowiedzialnością (s.r.o.)',
    es: 'Sociedad de responsabilidad limitada (s.r.o.)',
    it: 'Società a responsabilità limitata (s.r.o.)',
    nl: 'Besloten vennootschap (s.r.o.)',
    pt: 'Sociedade por quotas de responsabilidade limitada (s.r.o.)',
    sk: 'Spoločnosť s ručením obmedzeným',
    bg: 'Дружество с ограничена отговорност (s.r.o.)',
    uk: 'Товариство з обмеженою відповідальністю (s.r.o.)',
  },
  ico: '29725071',
  dic: '', // doplnit po registraci k DPH (pak se zobrazí automaticky)
  sidlo: 'Korunní 2569/108, Vinohrady, 101 00 Praha 10',
  spisovaZnacka: {
    cs: 'Městský soud v Praze, oddíl C, vložka 450761',
    en: 'Municipal Court in Prague, Section C, Insert 450761',
    de: 'Stadtgericht Prag, Abteilung C, Einlage 450761',
    fr: 'Tribunal municipal de Prague, section C, insertion 450761',
    pl: 'Sąd Miejski w Pradze, sekcja C, wpis 450761',
    es: 'Tribunal Municipal de Praga, sección C, inscripción 450761',
    it: 'Tribunale Municipale di Praga, sezione C, inserimento 450761',
    nl: 'Gemeentelijke rechtbank Praag, sectie C, inschrijving 450761',
    pt: 'Tribunal Municipal de Praga, secção C, inscrição 450761',
    sk: 'Mestský súd v Prahe, oddiel C, vložka 450761',
    bg: 'Градски съд в Прага, раздел C, вписване 450761',
    uk: 'Муніципальний суд у Празі, розділ C, запис 450761',
  },
  email: 'hello@trypup.life',
} as const;

export type Lang = 'cs' | 'en' | 'de' | 'fr' | 'pl' | 'es' | 'it' | 'nl' | 'pt' | 'sk' | 'bg' | 'uk';

const OPERATOR_LABELS: Record<Lang, {
  operator: string; legalForm: string; ico: string; dic: string;
  office: string; registry: string; email: string; controller: string;
}> = {
  cs: { operator: 'Provozovatel', legalForm: 'Právní forma', ico: 'IČO', dic: 'DIČ', office: 'Sídlo', registry: 'Zápis v OR', email: 'E-mail', controller: 'Správce údajů' },
  en: { operator: 'Operator', legalForm: 'Legal form', ico: 'Company ID (IČO)', dic: 'VAT ID (DIČ)', office: 'Registered office', registry: 'Commercial register', email: 'Email', controller: 'Data controller' },
  de: { operator: 'Betreiber', legalForm: 'Rechtsform', ico: 'Handelsregisternummer (IČO)', dic: 'USt-IdNr. (DIČ)', office: 'Sitz', registry: 'Handelsregistereintrag', email: 'E-Mail', controller: 'Verantwortlicher' },
  fr: { operator: 'Exploitant', legalForm: 'Forme juridique', ico: 'Numéro d’entreprise (IČO)', dic: 'Numéro de TVA (DIČ)', office: 'Siège social', registry: 'Immatriculation au registre du commerce', email: 'E-mail', controller: 'Responsable du traitement' },
  pl: { operator: 'Operator', legalForm: 'Forma prawna', ico: 'Numer identyfikacyjny (IČO)', dic: 'Numer VAT (DIČ)', office: 'Siedziba', registry: 'Wpis do rejestru handlowego', email: 'E-mail', controller: 'Administrator danych' },
  es: { operator: 'Operador', legalForm: 'Forma jurídica', ico: 'Número de identificación (IČO)', dic: 'NIF-IVA (DIČ)', office: 'Domicilio social', registry: 'Inscripción en el Registro Mercantil', email: 'Correo electrónico', controller: 'Responsable del tratamiento' },
  it: { operator: 'Gestore', legalForm: 'Forma giuridica', ico: 'Numero di identificazione (IČO)', dic: 'Partita IVA (DIČ)', office: 'Sede legale', registry: 'Iscrizione al registro delle imprese', email: 'E-mail', controller: 'Titolare del trattamento' },
  nl: { operator: 'Exploitant', legalForm: 'Rechtsvorm', ico: 'Bedrijfsnummer (IČO)', dic: 'Btw-nummer (DIČ)', office: 'Statutaire zetel', registry: 'Inschrijving handelsregister', email: 'E-mail', controller: 'Verwerkingsverantwoordelijke' },
  pt: { operator: 'Operador', legalForm: 'Forma jurídica', ico: 'Número de identificação (IČO)', dic: 'NIF (DIČ)', office: 'Sede social', registry: 'Registo comercial', email: 'E-mail', controller: 'Responsável pelo tratamento' },
  sk: { operator: 'Prevádzkovateľ', legalForm: 'Právna forma', ico: 'IČO', dic: 'DIČ', office: 'Sídlo', registry: 'Zápis v OR', email: 'E-mail', controller: 'Prevádzkovateľ údajov' },
  bg: { operator: 'Оператор', legalForm: 'Правна форма', ico: 'Идентификационен номер (IČO)', dic: 'ДДС номер (DIČ)', office: 'Седалище', registry: 'Вписване в търговския регистър', email: 'Имейл', controller: 'Администратор на данни' },
  uk: { operator: 'Оператор', legalForm: 'Організаційно-правова форма', ico: 'Ідентифікаційний номер (IČO)', dic: 'Номер платника ПДВ (DIČ)', office: 'Юридична адреса', registry: 'Запис у торговому реєстрі', email: 'Ел. пошта', controller: 'Розпорядник даних' },
};

/** Lokalizované popisky polí. Hodnoty samotné zůstávají univerzální. */
export function operatorLabels(lang: Lang) {
  return OPERATOR_LABELS[lang] ?? OPERATOR_LABELS.en;
}
