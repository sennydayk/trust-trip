// 점수 분해 근거 생성 — UI에 표시할 breakdown_json
// 스펙 섹션 5의 weight_profile + breakdown_json 형식

import type {
  TrustScoreResult,
  GoogleData,
  BlogData,
  KakaoData,
  SubScoreDetail,
} from './trust-score';

// ─── 타입 정의 ─────────────────────────────────────────

export interface BreakdownItem {
  label: string;
  value: string;
  type: 'positive' | 'negative' | 'neutral' | 'disabled';
}

export interface SourceBreakdown {
  source: string;
  sub_score: number;
  weight: number;
  contribution: number;        // sub_score × weight
  active: boolean;
  components: SourceComponentItem[];
}

export interface SourceComponentItem {
  name: string;
  raw_value: string;
  normalized: number;
  weight_in_source: number;
  contribution: number;
}

export interface BreakdownJson {
  final_score: number;
  raw_score: number;
  ad_penalty: number;
  freshness_bonus: number;
  formula: string;
  sources: SourceBreakdown[];
  items: BreakdownItem[];       // 간이 표시용
  weight_profile: {
    google: number;
    kakao: number;
    blog: number;
  };
}

// ─── 소수점 반올림 ────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ─── 소스별 상세 분해 ─────────────────────────────────

function buildSourceBreakdown(
  source: string,
  detail: SubScoreDetail | null,
  weight: number,
  active: boolean,
): SourceBreakdown {
  if (!detail) {
    return {
      source,
      sub_score: 0,
      weight,
      contribution: 0,
      active,
      components: [],
    };
  }

  return {
    source,
    sub_score: detail.score,
    weight,
    contribution: round2(detail.score * weight),
    active,
    components: detail.components.map(c => ({
      name: c.name,
      raw_value: formatRawValue(c.name, c.raw_value),
      normalized: c.normalized,
      weight_in_source: c.weight,
      contribution: c.contribution,
    })),
  };
}

function formatRawValue(name: string, value: number): string {
  if (name === '평점') return value.toFixed(1);
  if (name === '리뷰 수' || name === '최근성' || name === '추천 빈도' || name === '진짜 후기 비율') {
    return value.toLocaleString();
  }
  if (name === '감성' || name === '후기 감성') {
    return pct(value);
  }
  return String(value);
}

// ─── 간이 항목 생성 (UI 카드용) ───────────────────────

function buildSimpleItems(
  score: TrustScoreResult,
  google: GoogleData | null,
  kakao: KakaoData | null,
  blog: BlogData | null,
): BreakdownItem[] {
  const items: BreakdownItem[] = [];

  // Google 평점
  if (google) {
    items.push({
      label: 'Google 평점',
      value: `${google.rating.toFixed(1)} (${google.total_reviews.toLocaleString()}건)`,
      type: 'neutral',
    });
  } else {
    items.push({
      label: 'Google',
      value: '데이터 없음',
      type: 'disabled',
    });
  }

  // 블로그 추천
  if (blog && blog.total_posts > 0) {
    items.push({
      label: '블로그 추천',
      value: `${blog.total_posts}건 중 진짜 ${blog.organic_count}건`,
      type: blog.organic_count > 0 ? 'neutral' : 'negative',
    });

    // 광고 비율
    if (blog.confirmed_ad_count > 0) {
      const adPct = Math.round((blog.confirmed_ad_count / blog.total_posts) * 100);
      items.push({
        label: '광고 비율',
        value: `${adPct}% 제거됨`,
        type: 'negative',
      });
    }
  }

  // 최근 3개월
  if (google && google.recent_reviews_3m > 0) {
    const recentPct = Math.round(google.recent_positive_ratio * 100);
    items.push({
      label: '최근 3개월',
      value: `긍정 ${recentPct}%`,
      type: recentPct >= 70 ? 'positive' : 'neutral',
    });
  }

  // 카카오맵
  if (kakao) {
    items.push({
      label: '카카오맵',
      value: `${kakao.rating.toFixed(1)} (${kakao.total_reviews.toLocaleString()}건)`,
      type: 'neutral',
    });
  } else {
    items.push({
      label: '카카오맵',
      value: '해외 — 미적용',
      type: 'disabled',
    });
  }

  // 적용 가중치
  items.push({
    label: '적용 가중치',
    value: `G ${score.weight_profile.google.toFixed(2)} / K ${score.weight_profile.kakao.toFixed(2)} / B ${score.weight_profile.blog.toFixed(2)}`,
    type: 'neutral',
  });

  // 광고 패널티
  if (score.ad_penalty > 0) {
    items.push({
      label: '광고 패널티',
      value: `-${score.ad_penalty.toFixed(2)}`,
      type: 'negative',
    });
  }

  // 최신성 보너스
  if (score.freshness_bonus > 0) {
    items.push({
      label: '최신성 보너스',
      value: `+${score.freshness_bonus.toFixed(2)}`,
      type: 'positive',
    });
  }

  return items;
}

// ─── 메인 함수 ─────────────────────────────────────────

/**
 * UI에 표시할 breakdown_json 생성.
 * trust_scores 테이블의 breakdown_json 컬럼에 저장.
 */
export function generateBreakdown(
  score: TrustScoreResult,
  google: GoogleData | null,
  kakao: KakaoData | null,
  blog: BlogData | null,
): BreakdownJson {
  const weights = score.weight_profile;

  // 소스별 상세 분해
  const googleBreakdown = buildSourceBreakdown(
    'google',
    score.google_detail ?? null,
    weights.google,
    weights.google > 0,
  );
  const kakaoBreakdown = buildSourceBreakdown(
    'kakao',
    score.kakao_detail ?? null,
    weights.kakao,
    weights.kakao > 0,
  );
  const blogBreakdown = buildSourceBreakdown(
    'blog',
    score.blog_detail ?? null,
    weights.blog,
    weights.blog > 0,
  );

  // 간이 항목
  const items = buildSimpleItems(score, google, kakao, blog);

  return {
    final_score: score.final_score,
    raw_score: score.raw_score,
    ad_penalty: score.ad_penalty,
    freshness_bonus: score.freshness_bonus,
    formula: `(${score.raw_score.toFixed(2)} - ${score.ad_penalty.toFixed(2)} + ${score.freshness_bonus.toFixed(2)}) × 100 = ${score.final_score}`,
    sources: [googleBreakdown, kakaoBreakdown, blogBreakdown],
    items,
    weight_profile: {
      google: weights.google,
      kakao: weights.kakao,
      blog: weights.blog,
    },
  };
}
