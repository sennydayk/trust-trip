// 4단계: 신뢰도 점수 계산 — 동적 가중치 + 교차 검증 점수 산출

import { calculateTrustScore, type TrustScoreResult } from '@/lib/scoring/trust-score';
import { generateBreakdown, type BreakdownJson } from '@/lib/scoring/breakdown';
import type { PlaceAnalysis } from './analyze';

export interface ScoredPlace {
  name: string;
  address: string | undefined;
  category: string | undefined;
  latitude: number;
  longitude: number;
  mention_count: number;
  sources: string[];
  google_place_id: string | undefined;
  score: TrustScoreResult;
  breakdown: BreakdownJson;
  blog_posts: PlaceAnalysis['blog_posts'];
}

export async function scorePlaces(
  analyses: PlaceAnalysis[],
  regionType: 'domestic' | 'overseas',
): Promise<ScoredPlace[]> {
  const scored = analyses.map(({ place, google, kakao, blog, blog_posts }) => {
    const score = calculateTrustScore(regionType, google, kakao, blog);
    const breakdown = generateBreakdown(score, google, kakao, blog);

    return {
      name: place.name,
      address: place.address,
      category: place.category,
      latitude: place.latitude,
      longitude: place.longitude,
      mention_count: place.mention_count,
      sources: place.sources,
      google_place_id: place.google_place_id,
      score,
      breakdown,
      blog_posts,
    };
  });

  // 신뢰도 순 정렬
  scored.sort((a, b) => b.score.final_score - a.score.final_score);

  return scored;
}
