// src/i18n/get-dictionary.ts
import type { Locale } from './config';
import en from './dictionaries/en.json';
import ja from './dictionaries/ja.json';

const dictionaries = {
  en,
  ja
};

export const getDictionary = (locale: Locale) => dictionaries[locale];