import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 미들웨어 전용 Supabase 클라이언트.
 * 요청/응답 쿠키를 직접 읽고 쓸 수 있어
 * 서버에서 인증 세션을 정확하게 확인할 수 있다.
 */
export function createMiddlewareSupabase(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 요청 쿠키에 반영 (다운스트림 미들웨어/페이지용)
        cookiesToSet.forEach(({ name, value }) => {
          req.cookies.set(name, value);
        });

        // 응답 쿠키에 반영 (브라우저에 전달)
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  return { supabase, response };
}
