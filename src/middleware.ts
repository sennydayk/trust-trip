import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabase } from '@/lib/supabase-middleware';

// 인증이 필요한 경로
const PROTECTED_ROUTES = [
  '/mypage',
  '/research',
  '/results',
  '/route',
];

// 인증된 사용자가 접근하면 안 되는 경로
const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
];

export async function middleware(req: NextRequest) {
  // Supabase 환경 변수가 없으면 미들웨어 건너뛰기 (개발 모드)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const result = createMiddlewareSupabase(req);
  if (!result) return NextResponse.next();

  const { supabase, response } = result;
  const pathname = req.nextUrl.pathname;

  // 쿠키에서 실제 세션 검증 (토큰 refresh 포함)
  const { data: { user } } = await supabase.auth.getUser();

  // 보호된 라우트에 미인증 접근 → 로그인 리다이렉트
  // redirect 경로는 URL에 노출하지 않고 쿠키로 전달
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  if (isProtected && !user) {
    const loginUrl = new URL('/auth/login', req.url);
    // redirect 경로를 쿠키에 저장 (URL 노출 방지)
    const redirectResponse = NextResponse.redirect(loginUrl);
    redirectResponse.cookies.set('auth_redirect', pathname, {
      path: '/',
      maxAge: 300, // 5분
      httpOnly: false,
      sameSite: 'lax',
    });
    return redirectResponse;
  }

  // 인증 라우트에 이미 로그인된 사용자 → 메인으로 리다이렉트
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
