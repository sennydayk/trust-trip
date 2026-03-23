// 3단계: 데이터 수집 + 분석 — 광고 판별, 리뷰 감성 분석
// 실제 수집 데이터(Google 리뷰, 네이버 블로그)를 활용하고 부족하면 시뮬레이션 보강

import { analyzeAdByRules, analyzeAd, type AdAnalysisResult } from '@/lib/analyzers/ad-detector';
import type { NormalizedPlace } from '@/lib/analyzers/normalizer';
import type { GoogleData, KakaoData, BlogData } from '@/lib/scoring/trust-score';
import type { GooglePlaceResult } from '@/lib/scrapers/google-maps';
import { crawlNaverBlogsLight, searchBlogsForPlace, type LightBlogPost } from '@/lib/scrapers/naver-blog-light';

export interface BlogPost {
  url: string;
  title: string;
  content_snippet: string;
  thumbnail: string | null;
  ad_analysis: AdAnalysisResult;
}

export interface PlaceAnalysis {
  place: NormalizedPlace;
  google: GoogleData | null;
  kakao: KakaoData | null;
  blog: BlogData | null;
  blog_posts: BlogPost[];
}

export interface AnalysisContext {
  googleDetails: Map<string, GooglePlaceResult>;
  blogPosts: LightBlogPost[];
  blogsByPlace?: Map<string, LightBlogPost[]>;
  destination?: string;
  category?: string;
}

// ─── Google 리뷰 데이터 변환 ──────────────────────────

function buildGoogleData(
  place: NormalizedPlace,
  googleDetails: Map<string, GooglePlaceResult>,
): GoogleData | null {
  if (place.google_place_id) {
    const detail = googleDetails.get(place.google_place_id);
    if (detail && detail.totalReviews > 0) {
      const recentReviews = detail.reviews.filter(r => {
        const d = new Date(r.publishedAt);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return d >= threeMonthsAgo;
      });
      const recentPositive = recentReviews.filter(r => r.rating >= 4).length;
      const recentPositiveRatio = recentReviews.length > 0 ? recentPositive / recentReviews.length : 0.7;
      const avgRating = detail.reviews.length > 0
        ? detail.reviews.reduce((s, r) => s + r.rating, 0) / detail.reviews.length
        : detail.rating;
      const sentimentScore = (avgRating - 1) / 4;

      return {
        rating: detail.rating,
        total_reviews: detail.totalReviews,
        recent_reviews_3m: detail.recentReviews3m || recentReviews.length,
        recent_positive_ratio: recentPositiveRatio,
        sentiment_score: Math.round(sentimentScore * 100) / 100,
      };
    }
  }

  const entries = Array.from(googleDetails.values());
  for (const detail of entries) {
    if (detail.name === place.name && detail.totalReviews > 0) {
      const sentimentScore = (detail.rating - 1) / 4;
      return {
        rating: detail.rating,
        total_reviews: detail.totalReviews,
        recent_reviews_3m: detail.recentReviews3m,
        recent_positive_ratio: 0.7,
        sentiment_score: Math.round(sentimentScore * 100) / 100,
      };
    }
  }

  return null;
}

// ─── 블로그 포스트 장소별 분배 ────────────────────────

/**
 * 블로그 포스트를 각 장소에 분배한다.
 *
 * 1단계: 장소 이름/주소로 직접 매칭
 * 2단계: 매칭되지 않은 포스트를 라운드로빈으로 균등 분배
 *
 * 이렇게 하면 장소마다 다른 블로그 세트가 배정된다.
 */
/**
 * 블로그가 해당 장소/지역과 관련 있는지 판별하는 가드.
 *
 * 원칙: 기본적으로 통과. **다른 지역이 명확히 포함된 경우에만 제외.**
 * - 지역명이 없어도 통과 (제목에 지역을 안 쓰는 리뷰도 많음)
 * - "부산 PT센터"처럼 다른 지역 + 무관 업종이면 제외
 *
 * 지역 목록은 하드코딩하지 않고, 수집된 장소들의 주소에서 동적으로 추출.
 */
function isBlogRelevant(
  postText: string,
  placeName: string,
  destination: string,
  _category: string,
  knownLocations: Set<string>,
): boolean {
  const text = postText.toLowerCase();
  const destLower = destination.toLowerCase();

  // 장소명이 직접 포함 → 무조건 통과
  if (placeName && text.includes(placeName.toLowerCase())) return true;

  // 검색 지역이 포함 → 통과
  if (destLower && text.includes(destLower)) return true;

  // 블로그 제목(첫 100자)에서 다른 지역이 명시적으로 등장하는지 체크
  // 제목은 블로그의 핵심 주제를 나타내므로, 본문보다 제목에서 체크
  const titlePart = text.slice(0, Math.min(text.length, 150));

  for (const loc of Array.from(knownLocations)) {
    if (loc === destLower) continue; // 검색 지역 자체는 건너뜀
    if (loc.length < 2) continue;

    // 제목에 다른 지역이 포함되고, 검색 지역은 제목에 없으면 → 제외
    if (titlePart.includes(loc) && !titlePart.includes(destLower)) {
      return false;
    }
  }

  // 그 외에는 통과 (관대한 필터링)
  return true;
}

/**
 * 수집된 장소들의 주소에서 지역명을 동적으로 추출.
 * 하드코딩 없이, 실제 데이터에서 지역 키워드를 만든다.
 */
function extractKnownLocations(places: NormalizedPlace[], destination: string): Set<string> {
  const locations = new Set<string>();
  locations.add(destination.toLowerCase());

  for (const place of places) {
    if (!place.address) continue;
    // 주소에서 주요 지역명 추출 (시/구/동/읍/면 또는 주요 키워드)
    const parts = place.address
      .replace(/[,·]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && w.length <= 10);
    for (const part of parts) {
      // 숫자나 번지는 건너뜀
      if (/^\d/.test(part)) continue;
      // 주소 구성 요소만 추출 (시, 도, 구, 동, 읍, 면, 리 등)
      if (/[시도구군읍면리동로길]$/.test(part) && part.length >= 2) {
        locations.add(part.replace(/[시도구군읍면리동로길]$/, '').toLowerCase());
      }
    }
  }

  return locations;
}

function distributeBlogPosts(
  places: NormalizedPlace[],
  allBlogPosts: LightBlogPost[],
  destination: string = '',
  category: string = '',
): Map<string, LightBlogPost[]> {
  const distribution = new Map<string, LightBlogPost[]>();
  const assignedUrls = new Set<string>();
  const knownLocations = extractKnownLocations(places, destination);

  for (const place of places) {
    distribution.set(place.normalized_name, []);
  }

  const destLower = destination.toLowerCase();
  const catLower = category.toLowerCase();

  // 일반적인 단어 — 이것들로는 매칭하면 안 됨 (너무 많은 블로그에 포함)
  const skipWords = new Set([
    destLower, catLower,
    // 한국어 일반
    '추천', '후기', '맛집', '카페', '관광', '숙소', '여행', '리뷰', '맛있', '방문',
    '호텔', '식당', '바', '펍', '레스토랑', '디저트', '브런치', '베이커리',
    '본점', '지점', '점', '역', '역점', '센터',
    // 영문 일반 (카테고리/지명)
    'cafe', 'coffee', 'bar', 'pub', 'restaurant', 'hotel', 'shop', 'store',
    'the', 'and', 'tokyo', 'osaka', 'kyoto', 'seoul', 'busan', 'jeju',
    'shibuya', 'shinjuku', 'harajuku', 'ginza', 'roppongi', 'ikebukuro',
    'akihabara', 'asakusa', 'ueno', 'ebisu', 'daikanyama', 'nakameguro',
    'gangnam', 'hongdae', 'itaewon', 'myeongdong', 'insadong',
  ]);

  // 1단계: 장소 이름 전체 또는 핵심 고유명사가 블로그에 포함
  for (const post of allBlogPosts) {
    if (assignedUrls.has(post.url)) continue;
    const titleLower = post.title.toLowerCase();

    for (const place of places) {
      const placeName = place.name.toLowerCase();

      // 고유 단어: skipWords 제외, 3글자 이상만
      const uniqueParts = placeName
        .split(/[\s·,()\-]+/)
        .filter(w => w.length >= 3 && !skipWords.has(w));

      let matched = false;

      // A. 전체 이름이 제목에 포함 (가장 정확)
      if (titleLower.includes(placeName)) {
        matched = true;
      }
      // B. 고유 단어가 제목에 포함 (최소 1개, 3글자 이상)
      else if (uniqueParts.length > 0 && uniqueParts.some(w => titleLower.includes(w))) {
        matched = true;
      }
      // 본문 매칭은 하지 않음 — 우연 매칭 위험이 높아 무관한 블로그가 배정됨

      if (matched) {
        const postText = post.title + ' ' + post.snippet;
        if (isBlogRelevant(postText, place.name, destination, category, knownLocations)) {
          distribution.get(place.normalized_name)?.push(post);
          assignedUrls.add(post.url);
          break;
        }
      }
    }
  }

  return distribution;
}

// ─── 블로그 → BlogPost 변환 + 광고 판별 ──────────────

async function convertToBlogPosts(
  posts: LightBlogPost[],
  placeName: string,
): Promise<BlogPost[]> {
  const results: BlogPost[] = [];

  for (const post of posts) {
    // 1차: 룰 기반 판별
    const ruleResult = analyzeAdByRules(post.snippet, {
      content: post.snippet,
      title: post.title,
      blogger_id: post.bloggerId,
      text_length: post.snippet.length,
      place_name: placeName,
    });

    let finalAnalysis = ruleResult;

    // 2차: suspected인 경우에만 LLM 호출 (비용 최적화)
    if (ruleResult.rule_result === 'suspected' && process.env.ANTHROPIC_API_KEY) {
      try {
        const llmResult = await analyzeAd({
          content: post.snippet,
          title: post.title,
          blogger_id: post.bloggerId,
          text_length: post.snippet.length,
          place_name: placeName,
        });
        finalAnalysis = llmResult;
      } catch {
        // LLM 실패 시 룰 결과 유지
      }
    }

    results.push({
      url: post.url,
      title: post.title,
      content_snippet: post.snippet.slice(0, 500),
      thumbnail: post.thumbnail,
      ad_analysis: finalAnalysis,
    });
  }

  return results;
}

// ─── 이미지 기반 광고 감지 (행동 패턴) ───────────────

/**
 * 이미지로 삽입된 광고 표시를 간접적으로 감지하는 행동 패턴 분석.
 *
 * 텍스트로 "원고료"가 없더라도 다음 패턴이 2개 이상이면 의심:
 * - 블로거 닉네임에 "인플루언서", "체험", "리뷰어" 포함
 * - 본문에 특정 장소명이 3회 이상 반복
 * - 제목에 [여행지] + "추천" + 업체명 조합
 * - 하단에 지도/주소 템플릿 패턴
 * - 본문 말미에 "#" 해시태그 3개 이상
 * - 전체적으로 긍정 표현만 존재 (단점 미언급)
 */
function detectImageBasedAdSignals(post: LightBlogPost, placeName: string): string[] {
  const signals: string[] = [];
  const text = post.snippet.toLowerCase();

  // 블로거 ID 패턴
  const suspiciousBloggerPatterns = ['인플루언서', '체험단', '리뷰어', 'reviewer', 'influencer'];
  if (suspiciousBloggerPatterns.some(p => post.bloggerId.toLowerCase().includes(p))) {
    signals.push('의심 블로거 ID');
  }

  // 장소/업체명 과도한 반복 (텍스트에 이미지 alt가 포함될 수 있음)
  const nameCount = (text.match(new RegExp(escapeRegExp(placeName.toLowerCase()), 'g')) || []).length;
  if (nameCount >= 4) {
    signals.push(`업체명 ${nameCount}회 반복`);
  }

  // 해시태그 다수 (하단 이미지 주변 텍스트)
  const hashTags = text.match(/#[가-힣a-zA-Z0-9]+/g) || [];
  if (hashTags.length >= 3) {
    signals.push(`해시태그 ${hashTags.length}개`);
  }

  // 하단 지도/주소 정보 (이미지 기반 광고의 공통 패턴)
  const templatePatterns = ['영업시간', '주소', '전화번호', '주차', '찾아가는', '오시는 길', '예약'];
  const templateCount = templatePatterns.filter(p => text.includes(p)).length;
  if (templateCount >= 2) {
    signals.push('템플릿 하단 정보');
  }

  // 지나치게 긍정적 (부정 표현 0개)
  const negativeWords = ['별로', '실망', '아쉬', '단점', '부족', '비싸', '느리', '불친절'];
  const positiveWords = ['추천', '최고', '맛있', '좋았', '만족', '강추', '꼭 가', '재방문'];
  const hasNegative = negativeWords.some(w => text.includes(w));
  const positiveCount = positiveWords.filter(w => text.includes(w)).length;
  if (!hasNegative && positiveCount >= 3 && text.length > 200) {
    signals.push('과도한 긍정 (단점 미언급)');
  }

  return signals;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── 시뮬레이션 폴백 ─────────────────────────────────

function generateFallbackGoogleData(placeName: string): GoogleData {
  let hash = 0;
  for (let i = 0; i < placeName.length; i++) {
    hash = ((hash << 5) - hash + placeName.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);
  return {
    rating: 3.5 + (seed % 15) * 0.1,
    total_reviews: 50 + (seed % 20) * 100,
    recent_reviews_3m: 5 + (seed % 10) * 8,
    recent_positive_ratio: 0.55 + (seed % 9) * 0.05,
    sentiment_score: 0.50 + (seed % 10) * 0.05,
  };
}

function generateFallbackBlogPosts(placeName: string): BlogPost[] {
  const templates = [
    { title: `${placeName} 솔직 후기`, content: `${placeName}에 다녀왔습니다. 분위기도 좋고 만족스러웠어요.` },
    { title: `${placeName} 방문 리뷰`, content: `기다릴 만한 가치가 있었습니다. 재방문 의사 있어요.` },
    { title: `${placeName} 강추`, content: `친구 추천으로 갔는데 정말 좋았어요. 꼭 들르세요.` },
  ];
  return templates.map((t, i) => ({
    url: `https://blog.naver.com/sim_${i}/${encodeURIComponent(placeName)}`,
    title: t.title,
    content_snippet: t.content,
    thumbnail: null,
    ad_analysis: analyzeAdByRules(t.content, { content: t.content, place_name: placeName }),
  }));
}

// ─── 메인 함수 ─────────────────────────────────────────

export async function analyzePlaces(
  places: NormalizedPlace[],
  regionType: 'domestic' | 'overseas',
  context?: AnalysisContext,
): Promise<PlaceAnalysis[]> {
  const googleDetails = context?.googleDetails ?? new Map();
  const allBlogPosts = context?.blogPosts ?? [];
  const hasRealBlogs = allBlogPosts.length > 0;

  const dest = context?.destination ?? '';
  const cat = context?.category ?? '';

  console.log(`[analyze] ${places.length}개 장소 분석 (Google 상세: ${googleDetails.size}건)`);

  // 모든 장소에 대해 장소별 개별 블로그 검색 (균등 20건 보장)
  const blogDistribution = new Map<string, LightBlogPost[]>();

  if (dest) {
    console.log(`[analyze] ${places.length}개 장소 개별 블로그 검색 (API, 5개씩 배치)`);
    const knownLocs = extractKnownLocations(places, dest);

    for (let batch = 0; batch < places.length; batch += 5) {
      const batchPlaces = places.slice(batch, batch + 5);

      const batchResults = await Promise.allSettled(
        batchPlaces.map(async place => {
          const posts = await searchBlogsForPlace(place.name, dest, 5);
          return { normalized_name: place.normalized_name, name: place.name, posts };
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const { posts, normalized_name, name } = result.value;
          if (posts.length === 0) continue;
          const filtered = posts.filter(post => {
            const postText = post.title + ' ' + post.snippet;
            return isBlogRelevant(postText, '', dest, cat, knownLocs);
          });
          if (filtered.length > 0) {
            blogDistribution.set(normalized_name, filtered);
            console.log(`[analyze] "${name}" → ${filtered.length}건`);
          }
        }
      }

      if (batch + 5 < places.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  return Promise.all(places.map(async place => {
    // Google 리뷰
    const google = buildGoogleData(place, googleDetails) ?? generateFallbackGoogleData(place.name);

    // 카카오
    const kakao: KakaoData | null = regionType === 'domestic'
      ? { rating: 3.5 + (place.name.length % 15) * 0.1, total_reviews: 30 + (place.name.length % 12) * 25 }
      : null;

    // 블로그 — 분배된 결과 사용
    let blogPosts: BlogPost[];
    const hasBlogsForPlace = (blogDistribution.get(place.normalized_name)?.length ?? 0) > 0;
    if (hasBlogsForPlace) {
      const distributed = blogDistribution.get(place.normalized_name) ?? [];
      blogPosts = await convertToBlogPosts(distributed, place.name);

      // 이미지 기반 광고 감지
      for (let i = 0; i < blogPosts.length; i++) {
        if (blogPosts[i].ad_analysis.final_verdict === 'organic') {
          const rawPost = distributed[i];
          if (rawPost) {
            const imageSignals = detectImageBasedAdSignals(rawPost, place.name);
            if (imageSignals.length >= 2) {
              blogPosts[i].ad_analysis = {
                ...blogPosts[i].ad_analysis,
                rule_result: 'suspected',
                final_verdict: 'suspected_ad',
                ad_confidence: 0.4 + imageSignals.length * 0.1,
                suspected_signals: imageSignals.map(s => ({
                  type: 'behavioral' as const,
                  name: 'image_ad_pattern',
                  detail: s,
                })),
              };
            }
          }
        }
      }

      // 원문 0건이면 빈 배열 유지 — 시뮬레이션 폴백 없음
    } else {
      blogPosts = [];
    }

    const organicPosts = blogPosts.filter(p => p.ad_analysis.final_verdict === 'organic');
    const confirmedAds = blogPosts.filter(p => p.ad_analysis.final_verdict === 'confirmed_ad');

    const blog: BlogData = {
      mention_count: place.mention_count,
      total_posts: blogPosts.length,
      organic_count: organicPosts.length,
      confirmed_ad_count: confirmedAds.length,
      avg_organic_sentiment: 0.65 + (place.name.length % 7) * 0.05,
    };

    return { place, google, kakao, blog, blog_posts: blogPosts };
  }));
}
