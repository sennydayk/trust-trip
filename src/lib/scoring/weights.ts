// 동적 가중치 계산 — 스펙 섹션 5-2
// 국내/해외 기본 가중치 + 데이터 가용성 체크 + 비례 배분

// ─── 타입 정의 ─────────────────────────────────────────

export interface WeightProfile {
  google: number;
  kakao: number;
  blog: number;
}

export interface DataCounts {
  google_reviews: number;
  kakao_reviews: number;
  blog_posts: number;
}

export interface WeightResult {
  weights: WeightProfile;
  base: WeightProfile;
  active_sources: SourceStatus[];
  inactive_sources: SourceStatus[];
}

export interface SourceStatus {
  source: 'google' | 'kakao' | 'blog';
  count: number;
  threshold: number;
  active: boolean;
  base_weight: number;
  final_weight: number;
}

// ─── 상수 ──────────────────────────────────────────────

const BASE_WEIGHTS = {
  domestic: { google: 0.30, kakao: 0.35, blog: 0.35 } as WeightProfile,
  overseas: { google: 0.60, kakao: 0.15, blog: 0.25 } as WeightProfile,
};

const THRESHOLDS = {
  google: 10,  // min_reviews
  kakao: 10,   // min_reviews
  blog: 5,     // min_posts
};

// ─── 소수점 반올림 ────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── 메인 함수 ─────────────────────────────────────────

/**
 * 동적 가중치 계산.
 * 스펙 섹션 5-2의 calculateWeights(place, region_type) 구현.
 *
 * 1. 국내/해외에 따른 기본 가중치 프로필 선택
 * 2. 각 소스의 데이터 수가 임계값 미달이면 가중치 0
 * 3. 비활성 소스의 가중치를 활성 소스에 비례 배분
 */
export function calculateWeights(
  regionType: 'domestic' | 'overseas',
  data: DataCounts,
): WeightProfile {
  const result = calculateWeightsDetailed(regionType, data);
  return result.weights;
}

/**
 * 상세 가중치 결과 반환 (breakdown용).
 * 기본/최종 가중치, 활성/비활성 소스 상태 포함.
 */
export function calculateWeightsDetailed(
  regionType: 'domestic' | 'overseas',
  data: DataCounts,
): WeightResult {
  const base = { ...BASE_WEIGHTS[regionType] };

  // 각 소스별 상태 판정
  const sources: SourceStatus[] = [
    {
      source: 'google',
      count: data.google_reviews,
      threshold: THRESHOLDS.google,
      active: data.google_reviews >= THRESHOLDS.google,
      base_weight: base.google,
      final_weight: 0,
    },
    {
      source: 'kakao',
      count: data.kakao_reviews,
      threshold: THRESHOLDS.kakao,
      active: data.kakao_reviews >= THRESHOLDS.kakao,
      base_weight: base.kakao,
      final_weight: 0,
    },
    {
      source: 'blog',
      count: data.blog_posts,
      threshold: THRESHOLDS.blog,
      active: data.blog_posts >= THRESHOLDS.blog,
      base_weight: base.blog,
      final_weight: 0,
    },
  ];

  // 활성 소스의 기본 가중치 합계
  const totalActive = sources
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.base_weight, 0);

  // 비례 배분
  if (totalActive > 0) {
    for (const s of sources) {
      s.final_weight = s.active
        ? round2(s.base_weight / totalActive)
        : 0;
    }
  }

  // 반올림 오차 보정 (합계가 정확히 1.00이 되도록)
  const activeSources = sources.filter(s => s.active);
  if (activeSources.length > 0) {
    const sum = activeSources.reduce((acc, s) => acc + s.final_weight, 0);
    const diff = round2(1.0 - sum);
    if (diff !== 0) {
      activeSources[0].final_weight = round2(activeSources[0].final_weight + diff);
    }
  }

  const weights: WeightProfile = {
    google: sources[0].final_weight,
    kakao: sources[1].final_weight,
    blog: sources[2].final_weight,
  };

  return {
    weights,
    base,
    active_sources: sources.filter(s => s.active),
    inactive_sources: sources.filter(s => !s.active),
  };
}
