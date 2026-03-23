'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import SubScoreBar from '@/components/score/SubScoreBar';
import SourceDetail from '@/components/data/SourceDetail';
import BlogTable from '@/components/data/BlogTable';
import { getTrustColor } from '@/lib/utils/trust-color';
import type { FinalVerdict } from '@/lib/analyzers/ad-detector';

// ─── 타입 ──────────────────────────────────────────────

interface PlaceData {
  place_id: string;
  name: string;
  category: string | null;
  address: string | null;
  location: { lat: number; lng: number };
  mention_count: number;
  trust_score: {
    final_score: number;
    sub_scores: { google: number; kakao: number; blog: number };
    weights: { google: number; kakao: number; blog: number };
    ad_penalty: number;
    freshness_bonus: number;
  } | null;
  google: {
    rating: number;
    total_reviews: number;
    recent_reviews_3m: number;
    recent_positive_ratio: number;
    sentiment_score: number;
  } | null;
  kakao: {
    rating: number;
    total_reviews: number;
    category_tags: string[];
  } | null;
  blog_summary: {
    total: number;
    organic: number;
    suspected: number;
    confirmed_ad: number;
  };
  blog_posts: Array<{
    url: string;
    title: string;
    ad_status: string;
    sentiment_score: number | null;
    ad_analysis: {
      detected_keywords: string[];
      final_verdict: string;
      ad_confidence: number;
    } | null;
  }>;
}

// ─── DB 미연결 시 폴백 ────────────────────────────────
// 하드코딩 목 데이터 대신 "데이터 없음" 반환

// ─── 메인 페이지 ──────────────────────────────────────

export default function PlaceDetailPage({
  params,
}: {
  params: { placeId: string };
}) {
  const { placeId } = params;
  const [data, setData] = useState<PlaceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlace() {
      try {
        const res = await fetch(`/api/place/${placeId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          setData(null);
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchPlace();
  }, [placeId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-sm font-medium text-neutral-dark">장소 상세 정보를 불러올 수 없습니다.</p>
          <p className="mt-1 text-xs text-neutral-mid">Supabase DB 연결 시 상세 데이터를 확인할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="mt-4 bg-primary text-white font-medium rounded px-6 py-2.5 text-sm"
          >
            결과로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const score = data.trust_score;
  const colors = score ? getTrustColor(score.final_score) : getTrustColor(0);

  // 블로그 테이블 데이터
  const blogRows = data.blog_posts.map(post => ({
    url: post.url,
    title: post.title,
    verdict: (post.ad_analysis?.final_verdict ?? post.ad_status) as FinalVerdict,
    reason: post.ad_analysis?.detected_keywords?.join(', ')
      || (post.ad_analysis?.ad_confidence ? `확신도 ${(post.ad_analysis.ad_confidence * 100).toFixed(0)}%` : ''),
    sentiment: post.sentiment_score ?? undefined,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* ── 좌측 점수 패널 ───────────────────────── */}
        <aside className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-neutral-border p-5 lg:block">
          {/* 뒤로가기 */}
          <button
            type="button"
            onClick={() => window.history.back()}
            className="mb-5 flex items-center gap-1 text-xs text-neutral-mid hover:text-primary"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            결과로 돌아가기
          </button>

          {/* 신뢰도 점수 */}
          <p className={`text-[44px] font-semibold tracking-tight leading-none ${colors.text}`}>
            {score?.final_score ?? '—'}
          </p>

          {/* 장소 정보 */}
          <h1 className="mt-3 text-base font-semibold text-neutral-dark tracking-tight">
            {data.name}
          </h1>
          <p className="mt-1 text-xs text-neutral-mid">
            {[data.address, data.category].filter(Boolean).join(' · ')}
          </p>
          {data.mention_count > 0 && (
            <p className="mt-0.5 text-[10px] text-neutral-light">
              추천 {data.mention_count}회
            </p>
          )}

          {/* 서브점수 */}
          {score && (
            <>
              <p className="mt-6 text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">
                서브점수
              </p>
              <div className="mt-2.5 flex flex-col gap-2.5">
                <SubScoreBar
                  source="Google"
                  score={score.sub_scores.google}
                  weight={score.weights.google}
                  active={score.weights.google > 0}
                />
                <SubScoreBar
                  source="카카오"
                  score={score.sub_scores.kakao}
                  weight={score.weights.kakao}
                  active={score.weights.kakao > 0}
                />
                <SubScoreBar
                  source="블로그"
                  score={score.sub_scores.blog}
                  weight={score.weights.blog}
                  active={score.weights.blog > 0}
                />
              </div>

              {/* 보정 */}
              <p className="mt-5 text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">
                보정
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-mid">광고 패널티</span>
                  <span className="text-score-low font-medium">
                    -{score.ad_penalty.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-mid">최신성 보너스</span>
                  <span className="text-score-high-text font-medium">
                    +{score.freshness_bonus.toFixed(2)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* 동선에 추가 */}
          <button
            type="button"
            className="mt-6 w-full bg-primary text-white font-medium rounded px-6 py-2.5 text-sm"
          >
            동선에 추가
          </button>
        </aside>

        {/* ── 우측 메인 콘텐츠 ─────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-5 sm:pb-5">
          {/* 모바일 점수 헤더 */}
          <div className="mb-4 lg:hidden">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="mb-3 flex items-center gap-1 text-xs text-neutral-mid hover:text-primary"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              뒤로
            </button>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-semibold tracking-tight ${colors.text}`}>
                {score?.final_score ?? '—'}
              </span>
              <div>
                <h1 className="text-sm font-semibold text-neutral-dark">{data.name}</h1>
                <p className="text-[11px] text-neutral-mid">
                  {[data.address, data.category].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          </div>

          {/* 소스 상세 2열 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Google Maps 분석 */}
            <SourceDetail
              title="Google Maps"
              icon={<span className="block h-2 w-2 rounded-sm bg-primary" />}
              items={
                data.google
                  ? [
                      { label: '평점', value: `${data.google.rating.toFixed(1)} / 5.0`, highlight: true },
                      { label: '총 리뷰', value: data.google.total_reviews.toLocaleString() + '건' },
                      { label: '최근 3개월', value: data.google.recent_reviews_3m.toLocaleString() + '건' },
                      { label: '최근 긍정률', value: `${Math.round(data.google.recent_positive_ratio * 100)}%` },
                      { label: '감성 점수', value: `${Math.round(data.google.sentiment_score * 100)}%` },
                    ]
                  : [{ label: '데이터 없음', value: '—' }]
              }
            />

            {/* 네이버 블로그 분석 */}
            <SourceDetail
              title="네이버 블로그"
              icon={<span className="block h-2 w-2 rounded-sm bg-primary" />}
              items={[
                { label: '수집 포스트', value: `${data.blog_summary.total}건`, highlight: true },
                { label: '진짜 후기', value: `${data.blog_summary.organic}건` },
                { label: '의심 광고', value: `${data.blog_summary.suspected}건` },
                { label: '확정 광고', value: `${data.blog_summary.confirmed_ad}건` },
                {
                  label: '진짜 비율',
                  value: data.blog_summary.total > 0
                    ? `${Math.round((data.blog_summary.organic / data.blog_summary.total) * 100)}%`
                    : '—',
                },
              ]}
            />

            {/* 카카오맵 (있을 때만) */}
            {data.kakao && (
              <SourceDetail
                title="카카오맵"
                icon={<span className="block h-2 w-2 rounded-sm bg-primary" />}
                items={[
                  { label: '평점', value: `${data.kakao.rating.toFixed(1)} / 5.0`, highlight: true },
                  { label: '총 리뷰', value: data.kakao.total_reviews.toLocaleString() + '건' },
                  { label: '카테고리', value: data.kakao.category_tags?.join(', ') || '—' },
                ]}
              />
            )}
          </div>

          {/* 광고 판별 상세 */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] mb-2.5">
              광고 판별 상세
            </p>
            <div className="bg-neutral-surface rounded p-3.5">
              <BlogTable posts={blogRows} />
            </div>
          </div>

          {/* 모바일 서브점수 + 동선 추가 */}
          {score && (
            <div className="mt-5 lg:hidden">
              <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] mb-2">
                서브점수
              </p>
              <div className="bg-neutral-surface rounded p-3 space-y-2.5">
                <SubScoreBar source="Google" score={score.sub_scores.google} weight={score.weights.google} active={score.weights.google > 0} />
                <SubScoreBar source="카카오" score={score.sub_scores.kakao} weight={score.weights.kakao} active={score.weights.kakao > 0} />
                <SubScoreBar source="블로그" score={score.sub_scores.blog} weight={score.weights.blog} active={score.weights.blog > 0} />
              </div>
              <button type="button" className="mt-4 w-full bg-primary text-white font-medium rounded px-6 py-2.5 text-sm">
                동선에 추가
              </button>
            </div>
          )}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
