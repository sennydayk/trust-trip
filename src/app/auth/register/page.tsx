'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError('인증 서비스에 연결할 수 없습니다.');
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  async function handleSocialLogin(provider: 'google' | 'kakao') {
    const supabase = getSupabase();
    if (!supabase) {
      setError('인증 서비스에 연결할 수 없습니다.');
      return;
    }

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* 좌측 브랜딩 패널 */}
      <div className="hidden w-1/2 bg-neutral-surface lg:flex lg:flex-col lg:justify-center lg:px-16">
        <Link href="/" className="text-primary text-2xl font-semibold tracking-tight">
          TrustTrip
        </Link>
        <p className="mt-2 text-sm text-neutral-mid">
          추천이 아닌 검증. 신뢰할 수 있는 장소만 찾아드립니다.
        </p>

        <div className="mt-10 flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <span className="mt-1 block h-2 w-2 shrink-0 rounded-sm bg-primary" />
            <div>
              <p className="text-sm font-semibold text-neutral-dark tracking-tight">
                3개 소스 교차 검증
              </p>
              <p className="mt-0.5 text-xs text-neutral-mid">
                Google Maps, 네이버 블로그, 카카오맵 데이터를 교차 분석합니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-1 block h-2 w-2 shrink-0 rounded-sm bg-primary" />
            <div>
              <p className="text-sm font-semibold text-neutral-dark tracking-tight">
                AI 광고 필터
              </p>
              <p className="mt-0.5 text-xs text-neutral-mid">
                키워드 룰 + Claude AI로 광고성 후기를 자동 판별합니다.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-1 block h-2 w-2 shrink-0 rounded-sm bg-primary" />
            <div>
              <p className="text-sm font-semibold text-neutral-dark tracking-tight">
                투명한 신뢰도 점수
              </p>
              <p className="mt-0.5 text-xs text-neutral-mid">
                점수 산출 근거를 소스별로 분해하여 보여줍니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 우측 회원가입 폼 */}
      <div className="flex w-full items-center justify-center px-4 lg:w-1/2">
        <div className="w-full max-w-[320px]">
          {/* 모바일 로고 */}
          <div className="mb-8 lg:hidden">
            <Link href="/" className="text-primary text-xl font-semibold tracking-tight">
              TrustTrip
            </Link>
            <p className="mt-1 text-xs text-neutral-mid">
              추천이 아닌 검증. 신뢰할 수 있는 장소만 찾아드립니다.
            </p>
          </div>

          <h1 className="text-lg font-semibold tracking-tight text-neutral-dark">
            회원가입
          </h1>
          <p className="mt-1 text-xs text-neutral-mid">
            무료로 가입하고 여행 리서치를 시작하세요.
          </p>

          {error && (
            <div className="mt-4 rounded bg-score-low-bg p-2.5 text-xs text-score-low">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-dark" htmlFor="name">
                이름
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="홍길동"
                required
                className="mt-1 h-10 w-full rounded border border-neutral-border bg-white px-3 text-sm text-neutral-dark placeholder:text-neutral-light focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-dark" htmlFor="email">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="mt-1 h-10 w-full rounded border border-neutral-border bg-white px-3 text-sm text-neutral-dark placeholder:text-neutral-light focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-dark" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="6자 이상"
                required
                minLength={6}
                className="mt-1 h-10 w-full rounded border border-neutral-border bg-white px-3 text-sm text-neutral-dark placeholder:text-neutral-light focus:border-primary focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 bg-primary text-white font-medium rounded px-6 py-2.5 w-full text-sm disabled:opacity-50"
            >
              {loading ? '가입 중...' : '회원가입'}
            </button>
          </form>

          {/* 구분선 */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-border" />
            <span className="text-xs text-neutral-light">또는</span>
            <div className="h-px flex-1 bg-neutral-border" />
          </div>

          {/* 소셜 로그인 */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => handleSocialLogin('google')}
              className="bg-white border border-neutral-border text-neutral-mid rounded px-4 py-2 w-full flex items-center justify-center gap-2 text-sm font-medium hover:bg-neutral-surface transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google로 계속하기
            </button>
            <button
              type="button"
              onClick={() => handleSocialLogin('kakao')}
              className="bg-white border border-neutral-border text-neutral-mid rounded px-4 py-2 w-full flex items-center justify-center gap-2 text-sm font-medium hover:bg-neutral-surface transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#3C1E1E">
                <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.68l-1.19 4.38 5.08-3.35c.47.05.96.07 1.45.07 5.52 0 10-3.58 10-7.78S17.52 3 12 3z" />
              </svg>
              카카오로 계속하기
            </button>
          </div>

          {/* 하단 링크 */}
          <p className="mt-6 text-center text-xs text-neutral-mid">
            이미 계정이 있으신가요?{' '}
            <Link href="/auth/login" className="font-medium text-primary hover:underline">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
