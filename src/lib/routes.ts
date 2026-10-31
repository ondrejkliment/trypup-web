// Lokalizované cesty stránek, které existují ve všech 12 jazycích. JEDINÝ zdroj pro
// hreflang (Base.astro) i sitemap.xml (pages/sitemap.xml.ts). Navigace v Base.astro
// (STRINGS.*Href) musí vracet TYTÉŽ cesty — hlídá to assert v Base.astro.
import type { Lang } from './operator';

export const SITE = 'https://trypup.life';
export const ALL_LANGS: Lang[] = ['cs', 'en', 'de', 'fr', 'pl', 'es', 'it', 'nl', 'pt', 'sk', 'bg', 'uk'];

/** Stránky s mutací ve všech 12 jazycích. `join` sem nepatří (noindex, kód pozvánky v URL). */
export type LocalizedPage = 'home' | 'about' | 'privacy' | 'terms' | 'support';
export const LOCALIZED_PAGES: LocalizedPage[] = ['home', 'about', 'privacy', 'terms', 'support'];

const CS_PATHS: Record<LocalizedPage, string> = {
  home: '/', about: '/o-aplikaci/', privacy: '/zasady-ochrany/', terms: '/podminky/', support: '/podpora/',
};
const SLUG: Record<LocalizedPage, string> = {
  home: '', about: 'about/', privacy: 'privacy/', terms: 'terms/', support: 'support/',
};

export function pagePath(page: LocalizedPage, lang: Lang): string {
  return lang === 'cs' ? CS_PATHS[page] : `/${lang}/${SLUG[page]}`;
}

/** hreflang sada pro stránku: 12 jazyků + x-default (= angličtina). */
export function hreflangSet(page: LocalizedPage): { hreflang: string; href: string }[] {
  const set = ALL_LANGS.map((l) => ({ hreflang: l, href: SITE + pagePath(page, l) }));
  set.push({ hreflang: 'x-default', href: SITE + pagePath(page, 'en') });
  return set;
}

/** Stránky jen v cs + en (smazání účtu). */
export const CS_EN_PAIRS: [string, string][] = [['/smazat-ucet/', '/en/delete-account/']];

/** Stránky jen česky (bez hreflang), mimo blog: jména pro psa a psí jmeniny. */
export const CS_ONLY_PAGES: string[] = ['/jmena-pro-psa/'];
