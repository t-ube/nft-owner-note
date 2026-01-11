// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { match as matchLocale } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { i18n } from './i18n/config';

function getLocale(request: NextRequest): string {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();
  const locales = i18n.locales;
  
  return matchLocale(languages, locales, i18n.defaultLocale);
}

/*
async function updateSupabaseSession(request: NextRequest, response: NextResponse) {
  // response を let にして、内部で再生成できるようにします
  let currentResponse = response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // 1. リクエストの Cookie を更新
          request.cookies.set({ name, value, ...options });
          // 2. 新しいリクエスト情報を反映したレスポンスを生成
          currentResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          // 3. レスポンスの Cookie も更新
          currentResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          currentResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          currentResponse.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  await supabase.auth.getUser();

  return currentResponse;
}
*/

async function updateSupabaseSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
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
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isPageRequest = !pathname.startsWith('/api') && 
                         !pathname.startsWith('/_next') && 
                         !pathname.includes('.');

  // ページリクエストの場合のみ、i18nのリダイレクトチェックを行う
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
      return await updateSupabaseSession(request, redirectResponse);
    }
  }

  // APIリクエストや通常のページ遷移の場合
  // ここで updateSupabaseSession を通すことで、APIルートでもCookieが適切に処理される
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  return await updateSupabaseSession(request, response);
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