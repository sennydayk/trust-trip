'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import DestinationInput from '@/components/form/DestinationInput';

const CATEGORIES = ['맛집', '카페', '관광지', '숙소', '바/술집'];

const RECENT_SEARCHES = [
  { query: '오사카 맛집', date: '2026-03-14', status: 'completed', count: 12 },
  { query: '교토 카페', date: '2026-03-12', status: 'completed', count: 8 },
  { query: '도쿄 라멘', date: '2026-03-10', status: 'completed', count: 15 },
];

export default function HomePage() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!destination.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destination.trim(),
          category: category || '맛집',
        }),
      });

      const data = await res.json();
      if (data.session_id) {
        router.push(`/research/${data.session_id}`);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header showSearch={false} />

      <div className="flex flex-1">
        {/* 좌측 사이드바 */}
        <aside className="hidden border-r border-neutral-border p-4 w-[200px] lg:flex lg:w-[220px] lg:flex-col lg:shrink-0">
          <nav className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] mb-2 px-2">
              메뉴
            </p>
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded px-2 py-2 text-xs font-medium bg-primary-light text-primary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              새 리서치
            </Link>
            <Link
              href="/mypage"
              className="flex items-center gap-2.5 rounded px-2 py-2 text-xs font-medium text-neutral-mid hover:bg-neutral-surface hover:text-neutral-dark"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              내 리서치
            </Link>
            <Link
              href="/route"
              className="flex items-center gap-2.5 rounded px-2 py-2 text-xs font-medium text-neutral-mid hover:bg-neutral-surface hover:text-neutral-dark"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              저장한 코스
            </Link>
          </nav>

          {/* 최근 리서치 */}
          <div className="mt-8">
            <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] mb-2 px-2">
              최근 리서치
            </p>
            <div className="flex flex-col gap-1">
              {RECENT_SEARCHES.map((item, i) => (
                <div
                  key={i}
                  className="rounded px-2 py-1.5 hover:bg-neutral-surface cursor-pointer"
                >
                  <p className="text-xs font-medium text-neutral-dark truncate">
                    {item.query}
                  </p>
                  <p className="text-[10px] text-neutral-light">
                    {item.date} · {item.count}개 검증
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* 우측 메인 */}
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-20 sm:pb-0">
          <div className="w-full max-w-[560px]">
            {/* 헤드라인 */}
            <h1 className="text-center text-2xl font-semibold text-neutral-dark tracking-tight">
              어디로 떠나시나요?
            </h1>
            <p className="mt-2 text-center text-sm text-neutral-mid">
              추천이 아닌 검증. 신뢰할 수 있는 장소만 찾아드립니다.
            </p>

            {/* 검색 폼 */}
            <form onSubmit={handleSearch} className="mt-8">
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <DestinationInput
                  value={destination}
                  onChange={setDestination}
                />
                <input
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="카테고리 (예: 맛집)"
                  className="h-11 w-full rounded border border-neutral-border bg-white px-3.5 text-sm text-neutral-dark placeholder:text-neutral-light focus:border-primary focus:outline-none sm:w-[160px]"
                />
                <button
                  type="submit"
                  disabled={loading || !destination.trim()}
                  className="bg-primary text-white font-medium rounded px-6 py-2.5 text-sm whitespace-nowrap disabled:opacity-50 h-11"
                >
                  {loading ? '시작 중...' : '리서치 시작'}
                </button>
              </div>
            </form>

            {/* 카테고리 칩 */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={
                    category === cat
                      ? 'bg-primary text-white text-xs rounded px-2.5 py-0.5'
                      : 'border border-neutral-border text-neutral-mid text-xs rounded px-2.5 py-0.5 hover:border-primary hover:text-primary transition-colors'
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* 가치 제안 */}
            <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="bg-neutral-surface rounded p-3.5">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary-light">
                  <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="mt-2.5 text-xs font-semibold text-neutral-dark tracking-tight">
                  3개 소스 교차 검증
                </p>
                <p className="mt-1 text-[11px] text-neutral-mid leading-relaxed">
                  Google Maps, 네이버 블로그, 카카오맵 데이터를 교차 분석합니다.
                </p>
              </div>
              <div className="bg-neutral-surface rounded p-3.5">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary-light">
                  <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                  </svg>
                </div>
                <p className="mt-2.5 text-xs font-semibold text-neutral-dark tracking-tight">
                  AI 광고 필터
                </p>
                <p className="mt-1 text-[11px] text-neutral-mid leading-relaxed">
                  키워드 룰 + Claude AI로 광고성 후기를 자동 판별합니다.
                </p>
              </div>
              <div className="bg-neutral-surface rounded p-3.5">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary-light">
                  <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                  </svg>
                </div>
                <p className="mt-2.5 text-xs font-semibold text-neutral-dark tracking-tight">
                  투명한 신뢰도 점수
                </p>
                <p className="mt-1 text-[11px] text-neutral-mid leading-relaxed">
                  점수 산출 근거를 소스별로 분해하여 보여줍니다.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
