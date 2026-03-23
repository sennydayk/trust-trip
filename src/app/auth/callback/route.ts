// OAuth 콜백 라우트 — Supabase OAuth/매직링크 후 토큰을 세션으로 교환
// GET /auth/callback?code=xxx → 세션 설정 후 리다이렉트

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');

  // code가 없으면 메인으로 (fragment 기반 처리는 클라이언트에서)
  if (!code) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const response = NextResponse.redirect(new URL('/', req.url));

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // authorization code를 세션으로 교환
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] 세션 교환 실패:', error.message);
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  // redirect 쿠키가 있으면 해당 경로로, 없으면 메인으로
  const redirectPath = req.cookies.get('auth_redirect')?.value;
  if (redirectPath && redirectPath.startsWith('/')) {
    const redirectUrl = new URL(redirectPath, req.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);

    // 원래 세션 쿠키 복사
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });

    // redirect 쿠키 삭제
    redirectResponse.cookies.delete('auth_redirect');
    return redirectResponse;
  }

  // redirect 쿠키 정리
  response.cookies.delete('auth_redirect');
  return response;
}
