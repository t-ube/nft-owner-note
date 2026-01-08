// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { match as matchLocale } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { createServerClient } from '@supabase/ssr';
import { i18n } from './i18n/config';

function getLocale(request: NextRequest): string {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();
  const locales = i18n.locales;
  
  return matchLocale(languages, locales, i18n.defaultLocale);
}

async function updateSupabaseSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}
  
/*
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);
    const redirectResponse = NextResponse.redirect(
      new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url)
    );
    // リダイレクト時もセッション更新
    return updateSupabaseSession(request, redirectResponse);
  }

  // 通常のレスポンス
  const response = NextResponse.next({ request });
  
  // Supabaseセッション更新
  return updateSupabaseSession(request, response);
}
*/
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isPageRequest = !pathname.startsWith('/api') && 
                         !pathname.startsWith('/_next') && 
                         !pathname.includes('.');

  // 2. ページリクエストの場合のみ、i18nのリダイレクトチェックを行う
  if (isPageRequest) {
    const pathnameIsMissingLocale = i18n.locales.every(
      (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
    );

    if (pathnameIsMissingLocale) {
      const locale = getLocale(request);
      const redirectResponse = NextResponse.redirect(
        new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url)
      );
      // リダイレクト時もセッション更新
      return updateSupabaseSession(request, redirectResponse);
    }
  }

  // 3. APIリクエストや通常のページ遷移の場合
  // ここで updateSupabaseSession を通すことで、APIルートでもCookieが適切に処理される
  const response = NextResponse.next({ request });
  return updateSupabaseSession(request, response);
}

/*
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|images|favicon.ico).*)'],
};
*/

export const config = {
  // matcherは広く取り、内部のロジック(isPageRequest)でリダイレクトを制御する
  matcher: ['/((?!_next/static|_next/image|images|favicon.ico).*)'],
};