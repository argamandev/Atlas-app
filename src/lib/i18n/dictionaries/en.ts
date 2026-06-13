// English UI strings (default locale). The shape of this object IS the Dictionary type;
// he.ts must match it exactly, so adding a key here forces a Hebrew translation.
//
// NOTE: `brand` is a best-guess romanization of תמלול — confirm the English brand name.
export const en = {
  common: {
    brand: 'Timlul',
    menu: 'Menu',
    search: 'Search',
    loading: 'Loading…',
  },
  nav: {
    product: 'Product',
    enter: 'Sign in',
    home: 'Home',
    dashboard: 'Dashboard',
    companies: 'Companies',
    calendar: 'Calendar',
    chat: 'Chat',
    live: 'Live',
  },
  landing: {
    footerRights: 'All rights reserved',
  },
  language: {
    label: 'Language',
    english: 'English',
    hebrew: 'עברית',
  },
}

export type Dictionary = typeof en
