// 신뢰도 점수 계산 엔진 — 스펙 섹션 5
// 소스별 서브점수 × 동적 가중치 - 광고 패널티 + 최신성 보너스

import {
  calculateWeights,
  calculateWeightsDetailed,
  type WeightProfile,
  type WeightResult,
  type DataCounts,
} from './weights';

// ─── 타입 정의 ─────────────────────────────────────────

export interface GoogleData {
  rating: number;                  // 1.0 ~ 5.0
  total_reviews: number;
  recent_reviews_3m: number;
  recent_positive_ratio: number;   // 0.00 ~ 1.00
  sentiment_score: number;         // 0.00 ~ 1.00
}

export interface KakaoData {
  rating: number;                  // 1.0 ~ 5.0
  total_reviews: number;
}

export interface BlogData {
  mention_count: number;
  total_posts: number;
  organic_count: number;
  confirmed_ad_count: number;
  avg_organic_sentiment: number;   // 0.00 ~ 1.00
}

export interface SubScoreDetail {
  score: number;                   // 최종 서브 점수 (0.00 ~ 1.00)
  components: SubScoreComponent[]; // 각 항목별 세부
}

export interface SubScoreComponent {
  name: string;
  raw_value: number;
  normalized: number;
  weight: number;
  contribution: number;           // normalized × weight
}

export interface TrustScoreResult {
  google_sub_score: number;
  kakao_sub_score: number;
  blog_sub_score: number;
  ad_penalty: number;
  freshness_bonus: number;
  final_score: number;
  weight_profile: WeightProfile;
  // 상세 분해 데이터 (breakdown.ts에서 사용)
  google_detail: SubScoreDetail | null;
  kakao_detail: SubScoreDetail | null;
  blog_detail: SubScoreDetail | null;
  weight_detail: WeightResult;
  raw_score: number;
}

// ─── 소수점 반올림 ────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── 스펙 섹션 5-1: Google Maps 서브 점수 ─────────────

/**
 * google_sub = rating_norm × 0.35 + review_count_norm × 0.25
 *            + recency_norm × 0.20 + sentiment_norm × 0.20
 */
export function calculateGoogleSubScore(
  data: GoogleData | null,
): SubScoreDetail | null {
  if (!data) return null;

  // 평점: (rating - 1) / 4
  const ratingNorm = round2((data.rating - 1) / 4);
  // 리뷰 수: min(total / 1000, 1.0)
  const reviewCountNorm = round2(Math.min(data.total_reviews / 1000, 1.0));
  // 최근성: recent_3m / total (total이 0이면 0)
  const recencyNorm = data.total_reviews > 0
    ? round2(data.recent_reviews_3m / data.total_reviews)
    : 0;
  // 감성: sentiment_score 그대로
  const sentimentNorm = round2(data.sentiment_score);

  const components: SubScoreComponent[] = [
    { name: '평점', raw_value: data.rating, normalized: ratingNorm, weight: 0.35, contribution: round2(ratingNorm * 0.35) },
    { name: '리뷰 수', raw_value: data.total_reviews, normalized: reviewCountNorm, weight: 0.25, contribution: round2(reviewCountNorm * 0.25) },
    { name: '최근성', raw_value: data.recent_reviews_3m, normalized: recencyNorm, weight: 0.20, contribution: round2(recencyNorm * 0.20) },
    { name: '감성', raw_value: data.sentiment_score, normalized: sentimentNorm, weight: 0.20, contribution: round2(sentimentNorm * 0.20) },
  ];

  const score = round2(components.reduce((sum, c) => sum + c.contribution, 0));

  return { score, components };
}

// ─── 스펙 섹션 5-1: 카카오맵 서브 점수 ───────────────

/**
 * kakao_sub = rating_norm × 0.50 + review_count_norm × 0.50
 */
export function calculateKakaoSubScore(
  data: KakaoData | null,
): SubScoreDetail | null {
  if (!data) return null;

  // 평점: (rating - 1) / 4
  const ratingNorm = round2((data.rating - 1) / 4);
  // 리뷰 수: min(total / 500, 1.0)
  const reviewCountNorm = round2(Math.min(data.total_reviews / 500, 1.0));

  const components: SubScoreComponent[] = [
    { name: '평점', raw_value: data.rating, normalized: ratingNorm, weight: 0.50, contribution: round2(ratingNorm * 0.50) },
    { name: '리뷰 수', raw_value: data.total_reviews, normalized: reviewCountNorm, weight: 0.50, contribution: round2(reviewCountNorm * 0.50) },
  ];

  const score = round2(components.reduce((sum, c) => sum + c.contribution, 0));

  return { score, components };
}

// ─── 스펙 섹션 5-1: 블로그 서브 점수 ─────────────────

/**
 * blog_sub = mention_freq_norm × 0.40 + organic_ratio × 0.35
 *          + avg_sentiment × 0.25
 */
export function calculateBlogSubScore(
  data: BlogData | null,
): SubScoreDetail | null {
  if (!data || data.total_posts === 0) return null;

  // 추천 빈도: min(mention_count / 10, 1.0)
  const mentionFreqNorm = round2(Math.min(data.mention_count / 10, 1.0));
  // 진짜 후기 비율: organic_count / total_blog_count
  const organicRatio = round2(data.organic_count / data.total_posts);
  // 진짜 후기 평균 감성: organic 게시물만
  const avgSentiment = round2(data.avg_organic_sentiment);

  const components: SubScoreComponent[] = [
    { name: '추천 빈도', raw_value: data.mention_count, normalized: mentionFreqNorm, weight: 0.40, contribution: round2(mentionFreqNorm * 0.40) },
    { name: '진짜 후기 비율', raw_value: data.organic_count, normalized: organicRatio, weight: 0.35, contribution: round2(organicRatio * 0.35) },
    { name: '후기 감성', raw_value: data.avg_organic_sentiment, normalized: avgSentiment, weight: 0.25, contribution: round2(avgSentiment * 0.25) },
  ];

  const score = round2(components.reduce((sum, c) => sum + c.contribution, 0));

  return { score, components };
}

// ─── 스펙 섹션 5-3: 광고 패널티 ──────────────────────

/**
 * ad_penalty = ad_ratio × 0.15
 * ad_ratio = confirmed_ad_count / total_blog_count
 * 최대 0.15 감점
 */
export function calculateAdPenalty(
  confirmedAdCount: number,
  totalBlogCount: number,
): number {
  if (totalBlogCount === 0) return 0;
  const adRatio = confirmedAdCount / totalBlogCount;
  return round2(Math.min(adRatio * 0.15, 0.15));
}

// ─── 스펙 섹션 5-4: 최신성 보너스 ────────────────────

/**
 * freshness_bonus = recent_positive_change × 0.10
 * 최근 3개월 긍정률이 전체 대비 높으면 보너스
 * 최대 0.10 가점
 */
export function calculateFreshnessBonus(
  recentPositiveRatio: number,
  overallPositiveRatio: number,
): number {
  const change = recentPositiveRatio - overallPositiveRatio;
  if (change <= 0) return 0;
  return round2(Math.min(change * 0.10, 0.10));
}

// ─── 스펙 섹션 5-5: 최종 점수 ────────────────────────

/**
 * 전체 신뢰도 점수 계산.
 *
 * raw_score = google_sub × weight.google + kakao_sub × weight.kakao + blog_sub × weight.blog
 * final_score = (raw_score - ad_penalty + freshness_bonus) × 100
 *
 * 범위: 0 ~ 100, 소수점 첫째 자리까지 표시.
 */
export function calculateTrustScore(
  regionType: 'domestic' | 'overseas',
  google: GoogleData | null,
  kakao: KakaoData | null,
  blog: BlogData | null,
): TrustScoreResult {
  // 서브 점수 계산
  const googleDetail = calculateGoogleSubScore(google);
  const kakaoDetail = calculateKakaoSubScore(kakao);
  const blogDetail = calculateBlogSubScore(blog);

  const googleSub = googleDetail?.score ?? 0;
  const kakaoSub = kakaoDetail?.score ?? 0;
  const blogSub = blogDetail?.score ?? 0;

  // 동적 가중치
  const dataCounts: DataCounts = {
    google_reviews: google?.total_reviews ?? 0,
    kakao_reviews: kakao?.total_reviews ?? 0,
    blog_posts: blog?.total_posts ?? 0,
  };

  const weightDetail = calculateWeightsDetailed(regionType, dataCounts);
  const weights = weightDetail.weights;

  // 광고 패널티
  const adPenalty = calculateAdPenalty(
    blog?.confirmed_ad_count ?? 0,
    blog?.total_posts ?? 0,
  );

  // 최신성 보너스
  const freshnessBonus = google
    ? calculateFreshnessBonus(google.recent_positive_ratio, google.sentiment_score)
    : 0;

  // 최종 점수
  const rawScore = round2(
    googleSub * weights.google +
    kakaoSub * weights.kakao +
    blogSub * weights.blog,
  );

  const finalScoreRaw = (rawScore - adPenalty + freshnessBonus) * 100;
  const finalScore = Math.round(Math.max(0, Math.min(100, finalScoreRaw)) * 10) / 10;

  return {
    google_sub_score: googleSub,
    kakao_sub_score: kakaoSub,
    blog_sub_score: blogSub,
    ad_penalty: adPenalty,
    freshness_bonus: freshnessBonus,
    final_score: finalScore,
    weight_profile: weights,
    google_detail: googleDetail,
    kakao_detail: kakaoDetail,
    blog_detail: blogDetail,
    weight_detail: weightDetail,
    raw_score: rawScore,
  };
}
