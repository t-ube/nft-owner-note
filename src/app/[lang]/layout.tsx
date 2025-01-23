// src/app/[lang]/layout.tsx
import { i18n } from '@/i18n/config';

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export default function LocaleLayout({
  children,
  params: { lang },
}: {
  children: React.ReactNode;
  params: { lang: string };
}) {
  return <div lang={lang}>{children}</div>;
}
