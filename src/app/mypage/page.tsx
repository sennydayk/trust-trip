'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import { getSupabase } from '@/lib/supabase';
import { getTrustColor } from '@/lib/utils/trust-color';
import { getPipelineState, getPipelineResults } from '@/lib/pipeline/orchestrator';

// ─── 타입 ──────────────────────────────────────────────

interface ResearchItem {
  id: string;
  query: string;
  status: 'completed' | 'processing' | 'failed';
  verified: number;
  avgScore: number;
  date: string;
}

// ─── 상태 태그 ─────────────────────────────────────────

function StatusTag({ status }: { status: ResearchItem['status'] }) {
  const styles: Record<string, { className: string; label: string }> = {
    completed: {
      className: 'bg-score-high-bg text-score-high-text text-[10px] font-medium rounded-sm px-1.5 py-0.5',
      label: '완료',
    },
    processing: {
      className: 'bg-primary-light text-primary text-[10px] font-medium rounded-sm px-1.5 py-0.5',
      label: '진행중',
    },
    failed: {
      className: 'bg-score-low-bg text-score-low text-[10px] font-medium rounded-sm px-1.5 py-0.5',
      label: '실패',
    },
  };

  const s = styles[status] ?? styles.completed;
  return <span className={s.className}>{s.label}</span>;
}

// ─── 메인 페이지 ──────────────────────────────────────

export default function MyPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('사용자');
  const [userEmail, setUserEmail] = useState('user@example.com');
  const [research, setResearch] = useState<ResearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // 사용자 정보
      const supabase = getSupabase();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserName(user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? '사용자');
          setUserEmail(user.email ?? '');
        }
      }

      // 리서치 히스토리 — API에서 가져오기
      try {
        const res = await fetch('/api/mypage/research');
        if (res.ok) {
          const data = await res.json();
          setResearch(data.research ?? []);
        }
      } catch {
        // API 없으면 빈 배열 유지
      }

      setLoading(false);
    }
    loadData();
  }, []);

  async function handleLogout() {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/auth/login');
    router.refresh();
  }

  const completedCount = research.filter(r => r.status === 'completed').length;
  const initials = userName.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header showSearch={false} />

      <div className="flex flex-1 overflow-hidden">
        {/* ── 좌측 프로필 패널 ─────────────────────── */}
        <aside className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-neutral-border p-5 lg:flex lg:flex-col">
          <div className="flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-lg font-semibold text-primary">
              {initials}
            </div>
            <p className="mt-3 text-sm font-semibold text-neutral-dark tracking-tight">
              {userName}
            </p>
            <p className="mt-0.5 text-xs text-neutral-light truncate max-w-full">
              {userEmail}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="bg-neutral-surface rounded p-2.5 text-center">
              <p className="text-lg font-semibold text-neutral-dark tracking-tight">{completedCount}</p>
              <p className="text-[10px] text-neutral-light">리서치</p>
            </div>
            <div className="bg-neutral-surface rounded p-2.5 text-center">
              <p className="text-lg font-semibold text-neutral-dark tracking-tight">0</p>
              <p className="text-[10px] text-neutral-light">저장 코스</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-auto bg-white border border-neutral-border text-neutral-mid rounded px-4 py-2 w-full text-xs font-medium hover:bg-neutral-surface transition-colors"
          >
            로그아웃
          </button>
        </aside>

        {/* ── 우측 메인 ────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-5 sm:pb-5">
          {/* 모바일 프로필 */}
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-dark">{userName}</p>
              <p className="text-[11px] text-neutral-light">
                리서치 {completedCount}건
              </p>
            </div>
          </div>

          {/* 리서치 히스토리 */}
          <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] mb-2.5">
            리서치 히스토리
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : research.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-border">
                    <th className="py-2 pr-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] w-14">상태</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">검색어</th>
                    <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] hidden sm:table-cell w-16">검증 수</th>
                    <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] hidden sm:table-cell w-16">평균점수</th>
                    <th className="py-2 pl-2 text-right text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] w-20">날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {research.map(item => {
                    const scoreColors = item.avgScore > 0 ? getTrustColor(item.avgScore) : null;
                    return (
                      <tr key={item.id} className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-surface">
                        <td className="py-2.5 pr-2">
                          <StatusTag status={item.status} />
                        </td>
                        <td className="py-2.5 px-2">
                          {item.status === 'completed' ? (
                            <Link href={`/results/${item.id}`} className="font-medium text-primary hover:underline">
                              {item.query}
                            </Link>
                          ) : item.status === 'processing' ? (
                            <Link href={`/research/${item.id}`} className="font-medium text-primary hover:underline">
                              {item.query}
                            </Link>
                          ) : (
                            <span className="font-medium text-neutral-dark">{item.query}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right hidden sm:table-cell text-neutral-mid">
                          {item.verified > 0 ? `${item.verified}개` : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right hidden sm:table-cell">
                          {scoreColors ? (
                            <span className={`font-medium ${scoreColors.text}`}>{item.avgScore}</span>
                          ) : (
                            <span className="text-neutral-light">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-2 text-right text-neutral-light">{item.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 text-center py-6">
              <p className="text-sm text-neutral-light">아직 리서치 기록이 없습니다.</p>
              <Link href="/" className="mt-2 inline-block bg-primary text-white font-medium rounded px-6 py-2.5 text-sm">
                첫 리서치 시작하기
              </Link>
            </div>
          )}

          {/* 모바일 로그아웃 */}
          <div className="mt-8 lg:hidden">
            <button
              type="button"
              onClick={handleLogout}
              className="bg-white border border-neutral-border text-neutral-mid rounded px-4 py-2 w-full text-xs font-medium"
            >
              로그아웃
            </button>
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
