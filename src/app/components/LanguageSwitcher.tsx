// src/app/components/LanguageSwitcher.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { i18n } from '@/i18n/config';

export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLanguageChange = (newLocale: string) => {
    const currentPath = pathname.split('/').slice(2).join('/');
    router.push(`/${newLocale}/${currentPath}`);
  };

  return (
    <div className="fixed top-4 right-4">
      <select
        onChange={(e) => handleLanguageChange(e.target.value)}
        value={pathname.split('/')[1]}
        className="p-2 rounded border border-gray-300"
      >
        {i18n.locales.map((locale) => (
          <option key={locale} value={locale}>
            {locale === 'en' ? 'English' : '日本語'}
          </option>
        ))}
      </select>
    </div>
  );
}