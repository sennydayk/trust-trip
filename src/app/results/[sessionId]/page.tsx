'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import LayoutSwitcher from '@/components/layout/LayoutSwitcher';
import MetricCard from '@/components/cards/MetricCard';
import PlaceCard from '@/components/cards/PlaceCard';
import ScoreBreakdown from '@/components/cards/ScoreBreakdown';
import TrustBadge from '@/components/score/TrustBadge';
// SubScoreBar 제거 — 한 줄 뱃지로 대체
import MapView from '@/components/map/MapView';
import TrustMarker from '@/components/map/TrustMarker';
import { MapLegend } from '@/components/map/RouteOverlay';
import { getTrustColor } from '@/lib/utils/trust-color';
import { useLayout, type LayoutVariant } from '@/lib/utils/use-layout';

// ─── 타입 ──────────────────────────────────────────────

interface BreakdownItem {
  label: string;
  value: string;
  type: 'positive' | 'negative' | 'neutral' | 'disabled';
}

interface BlogPostResult {
  url: string;
  title: string;
  content_snippet?: string;
  thumbnail?: string | null;
  ad_status: string;
  ad_analysis?: {
    rule_result?: string;
    detected_keywords?: string[];
    final_verdict: string;
    ad_confidence: number;
  } | null;
}

interface PlaceResult {
  rank: number;
  name: string;
  place_id?: string;
  google_place_id?: string;
  address?: string;
  category?: string;
  location: { lat: number; lng: number };
  mention_count: number;
  trust_score: number;
  sub_scores: { google: number; kakao: number; blog: number };
  weights: { google: number; kakao: number; blog: number };
  ad_penalty: number;
  freshness_bonus: number;
  breakdown?: { items?: BreakdownItem[] } | BreakdownItem[];
  blog_analysis: {
    total: number;
    organic: number;
    suspected: number;
    confirmed_ad: number;
  };
  blog_posts?: BlogPostResult[];
}

interface ResultsData {
  session_id: string;
  status: string;
  query?: string;
  destination?: string;
  category?: string;
  region_type?: string;
  summary?: {
    total_places: number;
    total_blog_posts: number;
    ads_removed: number;
    verified: number;
    avg_trust_score: number;
  };
  pipeline_summary?: {
    collect?: { total: number };
    normalize?: { after: number };
    analyze?: { total_blog_posts: number; total_ads_detected: number };
    score?: { total_scored: number; avg_trust_score: number };
  };
  results?: PlaceResult[];
}

type ViewMode = 'list' | 'map';
type SortMode = 'score' | 'google_rating' | 'blog_count';

// ─── 공유: PlaceCard 펼침 콘텐츠 ──────────────────────

// ─── 다른 결과 보기 버튼 ──────────────────────────────

function ReSearchButton({
  destination, category, places, reSearching, setReSearching, router,
}: {
  destination: string;
  category: string;
  places: PlaceResult[];
  reSearching: boolean;
  setReSearching: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="mt-6 text-center">
      <button
        type="button"
        disabled={reSearching}
        onClick={async () => {
          setReSearching(true);
          const currentPlaceIds = places
            .map(p => p.google_place_id)
            .filter((id): id is string => !!id);
          try {
            const res = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ destination, category, excludePlaceIds: currentPlaceIds }),
            });
            const result = await res.json();
            if (result.session_id) {
              router.push(`/research/${result.session_id}`);
            }
          } catch {
            setReSearching(false);
          }
        }}
        className="bg-white border border-neutral-border text-neutral-dark rounded px-8 py-2.5 text-sm font-medium hover:border-primary hover:text-primary transition-colors disabled:opacity-50 shadow-sm"
      >
        {reSearching ? '검색 중...' : '다른 결과 보기'}
      </button>
      <p className="mt-2 text-[11px] text-neutral-light">
        원하는 장소를 찾지 못하셨나요? 같은 조건으로 새로운 장소를 탐색해 보세요.
      </p>
    </div>
  );
}

function BlogVerdictTag({ verdict }: { verdict: string }) {
  if (verdict === 'confirmed_ad') return <span className="bg-score-low-bg text-score-low text-[10px] font-medium rounded-sm px-1.5 py-0.5">광고</span>;
  if (verdict === 'suspected_ad') return <span className="bg-score-mid-bg text-score-mid-text text-[10px] font-medium rounded-sm px-1.5 py-0.5">의심</span>;
  return <span className="bg-score-high-bg text-score-high-text text-[10px] font-medium rounded-sm px-1.5 py-0.5">진짜</span>;
}

function BlogModal({
  posts,
  placeName,
  onClose,
}: {
  posts: BlogPostResult[];
  placeName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="mx-4 max-h-[80vh] w-full max-w-[520px] overflow-y-auto rounded bg-white p-4 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-neutral-dark tracking-tight">
            {placeName} — 블로그 리뷰 ({posts.length}건)
          </h3>
          <button type="button" onClick={onClose} className="text-neutral-light hover:text-neutral-dark">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {posts.map((post, i) => (
            <a
              key={i}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-2 rounded border border-neutral-border hover:bg-neutral-surface transition-colors"
            >
              {/* 썸네일 */}
              {post.thumbnail ? (
                <img
                  src={`/api/proxy/image?url=${encodeURIComponent(post.thumbnail)}`}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded object-cover bg-neutral-surface"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded bg-neutral-surface flex items-center justify-center">
                  <svg className="h-5 w-5 text-neutral-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
              )}
              {/* 내용 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <BlogVerdictTag verdict={post.ad_analysis?.final_verdict ?? post.ad_status} />
                  <span className="text-[10px] text-neutral-light">{post.url.includes('blog.naver.com') ? '네이버 블로그' : '블로그'}</span>
                </div>
                <p className="text-xs font-medium text-neutral-dark line-clamp-1">{post.title}</p>
                {post.content_snippet && (
                  <p className="mt-0.5 text-[10px] text-neutral-light line-clamp-2">{post.content_snippet.slice(0, 120)}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlaceExpandedContent({
  place,
  sessionId,
}: {
  place: PlaceResult;
  sessionId: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const [showAds, setShowAds] = useState(false);
  const breakdownItems = getBreakdownItems(place);
  const allPosts = place.blog_posts ?? [];
  // 원문만 필터 — 시뮬레이션 제외
  const realPosts = allPosts.filter(p => isRealBlogUrl(p.url));
  // 광고 제외 (기본) / 포함 (토글)
  const adCount = realPosts.filter(p => (p.ad_analysis?.final_verdict ?? p.ad_status) === 'confirmed_ad').length;
  const posts = showAds ? realPosts : realPosts.filter(p => (p.ad_analysis?.final_verdict ?? p.ad_status) !== 'confirmed_ad');

  return (
    <div className="space-y-3">
      {/* 서브점수 — 아이콘 + 브랜드 색상 뱃지 (N/A 비표시) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {place.weights.google > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5" style={{ backgroundColor: '#E8F0FE', color: '#4285F4' }}>
            <svg className="h-3 w-3" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {place.sub_scores.google.toFixed(2)}
          </span>
        )}
        {place.weights.kakao > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5" style={{ backgroundColor: '#FEE500', color: '#3C1E1E' }}>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="#3C1E1E"><path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.68l-1.19 4.38 5.08-3.35c.47.05.96.07 1.45.07 5.52 0 10-3.58 10-7.78S17.52 3 12 3z"/></svg>
            {place.sub_scores.kakao.toFixed(2)}
          </span>
        )}
        {place.weights.blog > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5" style={{ backgroundColor: '#E8F5E9', color: '#2DB400' }}>
            <svg className="h-3 w-3" viewBox="0 0 24 24"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" fill="#2DB400"/></svg>
            {place.sub_scores.blog.toFixed(2)}
          </span>
        )}
      </div>

      {/* 점수 분해 (가중치/보너스 제거) */}
      {breakdownItems.length > 0 && (
        <ScoreBreakdown items={breakdownItems.filter(item =>
          !item.label.includes('가중치') && !item.label.includes('보너스') && !item.label.includes('패널티')
        )} />
      )}

      {/* 블로그 분석 */}
      {realPosts.length > 0 && (
        <div className="bg-neutral-surface rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">
              블로그 분석
            </p>
            <span className="text-[10px] text-neutral-light">
              원문 {posts.length}건
              {adCount > 0 && !showAds && ` (광고 ${adCount}건 제외)`}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {posts.slice(0, 5).map((post, i) => (
              <a
                key={i}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-2.5 p-1.5 rounded hover:bg-white transition-colors border-b border-neutral-border last:border-b-0"
              >
                {post.thumbnail ? (
                  <img
                    src={`/api/proxy/image?url=${encodeURIComponent(post.thumbnail)}`}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded object-cover bg-neutral-border"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-neutral-border flex items-center justify-center">
                    <svg className="h-4 w-4 text-neutral-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <BlogVerdictTag verdict={post.ad_analysis?.final_verdict ?? post.ad_status} />
                  </div>
                  <p className="text-[11px] font-medium text-neutral-dark line-clamp-1 hover:text-primary">{post.title}</p>
                  {post.content_snippet && (
                    <p className="text-[9px] text-neutral-light line-clamp-1 mt-0.5">{post.content_snippet.slice(0, 80)}</p>
                  )}
                </div>
              </a>
            ))}
            {posts.length > 5 && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="mt-1.5 text-[10px] text-primary font-medium hover:underline"
              >
                전체 {posts.length}건 더보기
              </button>
            )}
            {adCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAds(!showAds)}
                className="mt-1 text-[10px] text-neutral-mid hover:text-neutral-dark"
              >
                {showAds ? '광고 숨기기' : `광고 ${adCount}건 포함 보기`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-2">
        {place.place_id && (
          <Link href={`/place/${place.place_id}`} className="bg-white border border-neutral-border text-neutral-mid rounded px-4 py-2 text-xs font-medium hover:bg-neutral-surface">
            상세 보기
          </Link>
        )}
        <Link href={`/route/${sessionId}`} className="bg-white border border-neutral-border text-neutral-mid rounded px-4 py-2 text-xs font-medium hover:bg-neutral-surface">
          동선에 추가
        </Link>
      </div>

      {/* 블로그 전체 모달 (원문만) */}
      {showModal && (
        <BlogModal posts={posts} placeName={place.name} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}

// ─── 공유: 지도 플레이스홀더 ──────────────────────────

function ResultsMap({ places }: { places: PlaceResult[] }) {
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const handleMapReady = useCallback((m: google.maps.Map) => {
    setMap(m);
    if (places.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      places.forEach(p => bounds.extend({ lat: p.location.lat, lng: p.location.lng }));
      m.fitBounds(bounds, 40);
    }
  }, [places]);

  const center = places.length > 0
    ? {
        lat: places.reduce((s, p) => s + p.location.lat, 0) / places.length,
        lng: places.reduce((s, p) => s + p.location.lng, 0) / places.length,
      }
    : { lat: 37.5665, lng: 126.978 };

  return (
    <div className="relative">
      <MapView
        center={center}
        zoom={13}
        className="h-[360px] w-full border border-neutral-border"
        onMapReady={handleMapReady}
      />
      {map && places.slice(0, 20).map((place, i) => (
        <TrustMarker
          key={i}
          map={map}
          position={{ lat: place.location.lat, lng: place.location.lng }}
          label={String(place.rank)}
          score={place.trust_score}
          title={`${place.name} (${place.trust_score}점)`}
          placeName={place.name}
          placeId={place.google_place_id}
          address={place.address}
        />
      ))}
      <div className="absolute bottom-2 right-2">
        <MapLegend />
      </div>
    </div>
  );
}

// ─── 공유: 필터/정렬 컨트롤 ──────────────────────────

interface FilterProps {
  minScore: number;
  setMinScore: (v: number) => void;
  sortMode: SortMode;
  setSortMode: (v: SortMode) => void;
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  categories: string[];
  direction?: 'row' | 'col';
}

function FilterControls({
  minScore, setMinScore, sortMode, setSortMode,
  selectedCategory, setSelectedCategory, categories,
  direction = 'col',
}: FilterProps) {
  if (direction === 'row') {
    // 카드형 인라인 필터
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-light">정렬</span>
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="h-7 rounded border border-neutral-border bg-white px-2 text-[10px] text-neutral-dark focus:border-primary focus:outline-none"
          >
            <option value="score">신뢰도순</option>
            <option value="google_rating">구글맵 평점순</option>
            <option value="blog_count">리뷰 많은순</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-light">최소</span>
          <input
            type="range" min={0} max={100} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="w-20 accent-primary h-1"
          />
          <span className="text-[10px] font-medium text-neutral-dark w-5">{minScore}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setSelectedCategory('')}
            className={!selectedCategory ? 'bg-primary text-white text-[10px] rounded px-2 py-0.5' : 'border border-neutral-border text-neutral-mid text-[10px] rounded px-2 py-0.5'}>
            전체
          </button>
          {categories.map(cat => (
            <button key={cat} type="button" onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={selectedCategory === cat ? 'bg-primary text-white text-[10px] rounded px-2 py-0.5' : 'border border-neutral-border text-neutral-mid text-[10px] rounded px-2 py-0.5'}>
              {cat}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 대시보드형 세로 필터 (사이드바)
  return (
    <div>
      <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] mb-2">필터</p>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-mid">최소 신뢰도</span>
          <span className="text-xs font-medium text-neutral-dark">{minScore}</span>
        </div>
        <input type="range" min={0} max={100} value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="w-full accent-primary h-1" />
      </div>
      <div className="mb-3">
        <span className="text-xs text-neutral-mid block mb-1.5">카테고리</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setSelectedCategory('')}
            className={!selectedCategory ? 'bg-primary text-white text-xs rounded px-2.5 py-0.5' : 'border border-neutral-border text-neutral-mid text-xs rounded px-2.5 py-0.5'}>
            전체
          </button>
          {categories.map(cat => (
            <button key={cat} type="button" onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={selectedCategory === cat ? 'bg-primary text-white text-xs rounded px-2.5 py-0.5' : 'border border-neutral-border text-neutral-mid text-xs rounded px-2.5 py-0.5'}>
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-xs text-neutral-mid block mb-1.5">정렬</span>
        <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}
          className="w-full h-8 rounded border border-neutral-border bg-white px-2 text-xs text-neutral-dark focus:border-primary focus:outline-none">
          <option value="score">신뢰도순</option>
          <option value="google_rating">구글맵 평점순</option>
          <option value="blog_count">리뷰 많은순</option>
        </select>
      </div>
    </div>
  );
}

// ─── 버전 A: 카드형 ──────────────────────────────────

function CardLayout({
  sessionId, filtered, summary, categories,
  minScore, setMinScore, sortMode, setSortMode,
  selectedCategory, setSelectedCategory,
  destination, category, reSearching, setReSearching, router,
}: {
  sessionId: string;
  filtered: PlaceResult[];
  summary: { total_places: number; ads_removed: number; verified: number; avg_trust_score: number };
  categories: string[];
  minScore: number; setMinScore: (v: number) => void;
  sortMode: SortMode; setSortMode: (v: SortMode) => void;
  selectedCategory: string; setSelectedCategory: (v: string) => void;
  destination: string; category: string;
  reSearching: boolean; setReSearching: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  return (
    <main className="mx-auto max-w-[640px] px-4 py-5 pb-20 sm:pb-5">
      {/* 요약 — 인라인 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tracking-tight text-neutral-dark">{summary.avg_trust_score}</span>
          <span className="text-[10px] text-neutral-light">평균 신뢰도</span>
        </div>
        <div className="h-5 w-px bg-neutral-border" />
        <div className="flex gap-3 text-[10px]">
          <span className="text-neutral-mid">{summary.total_places}곳 분석</span>
          <span className="text-score-high-text font-medium">검증 {summary.verified}</span>
          <span className="text-score-low font-medium">광고 {summary.ads_removed}</span>
        </div>
      </div>

      {/* 필터 + 뷰 전환 */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <FilterControls
          direction="row"
          minScore={minScore} setMinScore={setMinScore}
          sortMode={sortMode} setSortMode={setSortMode}
          selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
          categories={categories}
        />
        <div className="flex shrink-0">
          <button type="button" onClick={() => setViewMode('list')}
            className={`text-[10px] rounded-l px-2.5 py-1 font-medium border ${viewMode === 'list' ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-mid border-neutral-border'}`}>
            리스트
          </button>
          <button type="button" onClick={() => setViewMode('map')}
            className={`text-[10px] rounded-r px-2.5 py-1 font-medium border border-l-0 ${viewMode === 'map' ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-mid border-neutral-border'}`}>
            지도
          </button>
        </div>
      </div>

      {/* 결과 수 */}
      <p className="mt-3 text-[10px] text-neutral-light">{filtered.length}개 장소</p>

      {viewMode === 'list' ? (
        /* 세로 카드 리스트 */
        <div className="mt-2 flex flex-col gap-2.5">
          {filtered.map((place, idx) => {
            const displayRank = idx + 1;
            const adPct = place.blog_analysis.total > 0
              ? Math.round((place.blog_analysis.confirmed_ad / place.blog_analysis.total) * 100)
              : 0;

            return (
              <PlaceCard
                key={place.rank}
                rank={displayRank}
                name={place.name}
                address={place.address}
                category={place.category}
                trustScore={place.trust_score}
                googleRating={place.sub_scores.google > 0 ? Math.round((place.sub_scores.google * 4 + 1) * 10) / 10 : undefined}
                blogCount={place.blog_analysis.total}
                adPercent={adPct > 0 ? adPct : undefined}
                mentionCount={place.mention_count}
              >
                <PlaceExpandedContent place={place} sessionId={sessionId} />
              </PlaceCard>
            );
          })}
        </div>
      ) : (
        /* 지도 뷰 */
        <div className="mt-2">
          <ResultsMap places={filtered} />
          <div className="mt-3 flex flex-col gap-2">
            {filtered.map((place, idx) => {
              const colors = getTrustColor(place.trust_score);
              return (
                <div key={place.rank} className="flex items-center gap-2.5 bg-neutral-surface rounded px-3 py-2">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold text-white ${colors.badge}`}>
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-xs font-medium text-neutral-dark truncate">{place.name}</span>
                  <TrustBadge score={place.trust_score} size="sm" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-sm text-neutral-light">조건에 맞는 장소가 없습니다.</p>
          <button type="button" onClick={() => { setMinScore(0); setSelectedCategory(''); }}
            className="mt-2 text-xs text-primary font-medium hover:underline">
            필터 초기화
          </button>
        </div>
      )}

      {/* 다른 결과 보기 */}
      <ReSearchButton
        destination={destination}
        category={category}
        places={filtered}
        reSearching={reSearching}
        setReSearching={setReSearching}
        router={router}
      />

      {/* 하단 동선 설계 */}
      <Link href={`/route/${sessionId}`}
        className="mt-5 block w-full text-center bg-primary text-white font-medium rounded px-6 py-2.5 text-sm">
        동선 설계 시작
      </Link>
    </main>
  );
}

// ─── 버전 B: 대시보드형 ──────────────────────────────

function DashboardLayout({
  sessionId, filtered, summary, categories,
  minScore, setMinScore, sortMode, setSortMode,
  selectedCategory, setSelectedCategory,
  destination, category, reSearching, setReSearching, router,
}: {
  sessionId: string;
  filtered: PlaceResult[];
  summary: { total_places: number; ads_removed: number; verified: number; avg_trust_score: number };
  categories: string[];
  minScore: number; setMinScore: (v: number) => void;
  sortMode: SortMode; setSortMode: (v: SortMode) => void;
  selectedCategory: string; setSelectedCategory: (v: string) => void;
  destination: string; category: string;
  reSearching: boolean; setReSearching: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 사이드바 */}
      <aside className="hidden w-[260px] shrink-0 overflow-y-auto border-r border-neutral-border lg:block">
        {/* 리서치 요약 — 핵심 수치 강조 */}
        <div className="p-5 border-b border-neutral-border">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-xs font-semibold text-neutral-dark tracking-tight">리서치 요약</span>
            <span className="text-[10px] text-neutral-light">{summary.total_places}곳 분석</span>
          </div>

          {/* 핵심 지표: 평균 신뢰도 크게 */}
          <div className="flex items-center gap-4 mb-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-neutral-dark">{summary.avg_trust_score}</p>
              <p className="text-[10px] text-neutral-light mt-0.5">평균 신뢰도</p>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-neutral-mid">검증 완료</span>
                <span className="text-xs font-semibold text-score-high-text">{summary.verified}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-neutral-mid">광고 감지</span>
                <span className="text-xs font-semibold text-score-low">{summary.ads_removed}</span>
              </div>
            </div>
          </div>

          {/* 신뢰도 분포 바 */}
          <div className="h-1.5 bg-neutral-border rounded-full overflow-hidden flex">
            <div className="bg-score-high rounded-full" style={{ width: `${Math.min(summary.avg_trust_score, 100)}%` }} />
          </div>
        </div>

        {/* 필터 */}
        <div className="p-5 border-b border-neutral-border">
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-neutral-dark">최소 신뢰도</span>
              <span className="text-xs font-semibold text-primary">{minScore}</span>
            </div>
            <input type="range" min={0} max={100} value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="w-full accent-primary h-1" />
          </div>

          {categories.length > 0 && (
            <div className="mb-3">
              <span className="text-[10px] font-semibold text-neutral-dark block mb-1.5">카테고리</span>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setSelectedCategory('')}
                  className={!selectedCategory ? 'bg-primary text-white text-[10px] rounded-full px-3 py-1' : 'border border-neutral-border text-neutral-mid text-[10px] rounded-full px-3 py-1 hover:border-primary'}>
                  전체
                </button>
                {categories.map(cat => (
                  <button key={cat} type="button" onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                    className={selectedCategory === cat ? 'bg-primary text-white text-[10px] rounded-full px-3 py-1' : 'border border-neutral-border text-neutral-mid text-[10px] rounded-full px-3 py-1 hover:border-primary'}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="text-[10px] font-semibold text-neutral-dark block mb-1.5">정렬</span>
            <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}
              className="w-full h-8 rounded border border-neutral-border bg-white px-2.5 text-[11px] text-neutral-dark focus:border-primary focus:outline-none">
              <option value="score">신뢰도순</option>
              <option value="google_rating">구글맵 평점순</option>
              <option value="blog_count">리뷰 많은순</option>
            </select>
          </div>
        </div>

        {/* 동선 설계 */}
        <div className="p-5">
          <Link href={`/route/${sessionId}`}
            className="block w-full text-center bg-primary text-white font-medium rounded px-6 py-2.5 text-sm hover:bg-primary/90 transition-colors">
            동선 설계 시작
          </Link>
        </div>
      </aside>

      {/* 메인 */}
      <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-5 sm:pb-5">
        {/* 모바일 요약 — 컴팩트 */}
        <div className="mb-4 flex items-center gap-3 lg:hidden">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight text-neutral-dark">{summary.avg_trust_score}</span>
            <span className="text-[10px] text-neutral-light">평균 신뢰도</span>
          </div>
          <div className="h-6 w-px bg-neutral-border" />
          <div className="flex gap-3 text-[10px]">
            <span className="text-neutral-mid">{summary.total_places}곳</span>
            <span className="text-score-high-text font-medium">검증 {summary.verified}</span>
            <span className="text-score-low font-medium">광고 {summary.ads_removed}</span>
          </div>
        </div>

        <ResultsMap places={filtered} />

        {/* 뷰 전환 */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-neutral-mid">{filtered.length}개 장소</span>
          <div className="flex">
            <button type="button" onClick={() => setViewMode('card')}
              className={`text-xs rounded-l px-3 py-1.5 font-medium border ${viewMode === 'card' ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-mid border-neutral-border'}`}>
              카드
            </button>
            <button type="button" onClick={() => setViewMode('table')}
              className={`text-xs rounded-r px-3 py-1.5 font-medium border border-l-0 ${viewMode === 'table' ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-mid border-neutral-border'}`}>
              테이블
            </button>
          </div>
        </div>

        {viewMode === 'card' ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((place, idx) => {
              const adPct = place.blog_analysis.total > 0
                ? Math.round((place.blog_analysis.confirmed_ad / place.blog_analysis.total) * 100)
                : 0;
              return (
                <PlaceCard key={place.rank} rank={idx + 1} name={place.name} address={place.address} category={place.category}
                  trustScore={place.trust_score}
                  googleRating={place.sub_scores.google > 0 ? Math.round((place.sub_scores.google * 4 + 1) * 10) / 10 : undefined}
                  blogCount={place.blog_analysis.total} adPercent={adPct > 0 ? adPct : undefined} mentionCount={place.mention_count}>
                  <PlaceExpandedContent place={place} sessionId={sessionId} />
                </PlaceCard>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-border">
                  <th className="py-2 pr-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] w-8">#</th>
                  <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">장소</th>
                  <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] hidden sm:table-cell">카테고리</th>
                  <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] w-14">점수</th>
                  <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] hidden sm:table-cell w-16">블로그</th>
                  <th className="py-2 pl-2 text-right text-xs font-semibold text-neutral-light uppercase tracking-[0.5px] hidden sm:table-cell w-14">광고</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((place, idx) => {
                  const displayRank = idx + 1;
                  const adPct = place.blog_analysis.total > 0 ? Math.round((place.blog_analysis.confirmed_ad / place.blog_analysis.total) * 100) : 0;
                  return (
                    <tr key={place.rank} className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-surface">
                      <td className="py-2 pr-2">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-semibold text-white ${displayRank <= 3 ? 'bg-score-high' : 'bg-score-mid'}`}>{displayRank}</span>
                      </td>
                      <td className="py-2 px-2">
                        <p className="font-medium text-neutral-dark">{place.name}</p>
                        <p className="text-[10px] text-neutral-light">{place.address}</p>
                      </td>
                      <td className="py-2 px-2 hidden sm:table-cell text-neutral-mid">{place.category ?? '-'}</td>
                      <td className="py-2 px-2 text-right"><TrustBadge score={place.trust_score} size="sm" /></td>
                      <td className="py-2 px-2 text-right hidden sm:table-cell text-neutral-mid">{place.blog_analysis.total}건</td>
                      <td className="py-2 pl-2 text-right hidden sm:table-cell">
                        {adPct > 0 ? <span className="text-score-low font-medium">{adPct}%</span> : <span className="text-neutral-light">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="mt-8 text-center">
            <p className="text-sm text-neutral-light">조건에 맞는 장소가 없습니다.</p>
            <button type="button" onClick={() => { setMinScore(0); setSelectedCategory(''); }}
              className="mt-2 text-xs text-primary font-medium hover:underline">
              필터 초기화
            </button>
          </div>
        )}

        {/* 다른 결과 보기 */}
        <ReSearchButton
          destination={destination}
          category={category}
          places={filtered}
          reSearching={reSearching}
          setReSearching={setReSearching}
          router={router}
        />
      </main>
    </div>
  );
}

// ─── 메인 페이지 (Suspense 래퍼) ─────────────────────

function ResultsPageInner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [layout, setLayout] = useLayout();
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reSearching, setReSearching] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [minScore, setMinScore] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch(`/api/results/${sessionId}`);
        const json = await res.json();
        setData(json);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-neutral-light">결과를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  if (!data || data.status === 'failed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-sm text-neutral-dark font-medium">결과를 불러올 수 없습니다.</p>
          <Link href="/" className="mt-3 inline-block bg-primary text-white font-medium rounded px-6 py-2.5 text-sm">홈으로</Link>
        </div>
      </div>
    );
  }

  const places = data.results ?? [];
  const summary = data.summary ?? {
    total_places: data.pipeline_summary?.collect?.total ?? places.length,
    total_blog_posts: data.pipeline_summary?.analyze?.total_blog_posts ?? 0,
    ads_removed: data.pipeline_summary?.analyze?.total_ads_detected ?? 0,
    verified: data.pipeline_summary?.score?.total_scored ?? places.length,
    avg_trust_score: data.pipeline_summary?.score?.avg_trust_score ?? 0,
  };

  const categories = Array.from(new Set(places.map(p => p.category).filter(Boolean))) as string[];

  let filtered = places.filter(p => p.trust_score >= minScore);
  if (selectedCategory) filtered = filtered.filter(p => p.category === selectedCategory);
  filtered.sort((a, b) => {
    if (sortMode === 'score') return b.trust_score - a.trust_score;
    if (sortMode === 'google_rating') return (b.sub_scores?.google ?? 0) - (a.sub_scores?.google ?? 0);
    if (sortMode === 'blog_count') return (b.blog_posts?.length ?? 0) - (a.blog_posts?.length ?? 0);
    return b.trust_score - a.trust_score;
  });

  const sharedProps = {
    sessionId, filtered, summary, categories,
    minScore, setMinScore, sortMode, setSortMode,
    selectedCategory, setSelectedCategory,
    destination: data?.destination ?? '',
    category: data?.category ?? '',
    reSearching, setReSearching, router,
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      {/* 상단 바: 레이아웃 전환 */}
      <div className="border-b border-neutral-border px-4 py-1.5 flex items-center justify-end">
        <LayoutSwitcher variant={layout} onChange={setLayout} />
      </div>

      {layout === 'card' ? (
        <CardLayout {...sharedProps} />
      ) : (
        <DashboardLayout {...sharedProps} />
      )}

      <MobileNav />
    </div>
  );
}

export default function ResultsPage({
  params,
}: {
  params: { sessionId: string };
}) {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <ResultsPageInner sessionId={params.sessionId} />
    </Suspense>
  );
}

// ─── 유틸 ──────────────────────────────────────────────

function getBreakdownItems(place: PlaceResult): BreakdownItem[] {
  if (!place.breakdown) return [];
  if (Array.isArray(place.breakdown)) return place.breakdown as BreakdownItem[];
  if (place.breakdown.items && Array.isArray(place.breakdown.items)) return place.breakdown.items;
  return [];
}

function isRealBlogUrl(url: string): boolean {
  if (!url) return false;
  // 시뮬레이션 URL 패턴: blog.naver.com/sim_N/...
  if (url.includes('/sim_')) return false;
  // 실제 네이버 블로그: blog.naver.com/블로거ID/포스트번호
  if (url.includes('blog.naver.com')) return /blog\.naver\.com\/[a-zA-Z0-9_]+\/\d+/.test(url);
  // 기타 URL은 실제로 간주
  return url.startsWith('http');
}
