import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ─── 브라우저 클라이언트 (싱글턴) ─────────────────────
// @supabase/ssr의 createBrowserClient는 쿠키 기반 저장소를 사용하여
// 서버 미들웨어에서도 세션을 읽을 수 있다.

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (typeof window === 'undefined') {
    // SSR 컨텍스트에서는 매번 새로 생성 (요청별 격리)
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  // 브라우저에서는 싱글턴 유지
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}

// 하위 호환
export const supabase = typeof window !== 'undefined' ? getSupabase() : null;

// ─── 서버 전용 클라이언트 (service role) ──────────────
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 서버 환경 변수 미설정');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}
