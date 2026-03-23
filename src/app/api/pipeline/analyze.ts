// 3단계: 데이터 수집 + 분석 — 광고 판별, 리뷰 감성 분석 병렬 실행
// 실제 API 호출 시도 → 실패 시 검색어 기반 시뮬레이션 데이터 생성

import { analyzeAdByRules, type AdAnalysisResult } from '@/lib/analyzers/ad-detector';
import type { NormalizedPlace } from '@/lib/analyzers/normalizer';
import type { GoogleData, KakaoData, BlogData } from '@/lib/scoring/trust-score';

export interface BlogPost {
  url: string;
  title: string;
  content_snippet: string;
  ad_analysis: AdAnalysisResult;
}

export interface PlaceAnalysis {
  place: NormalizedPlace;
  google: GoogleData | null;
  kakao: KakaoData | null;
  blog: BlogData | null;
  blog_posts: BlogPost[];
}

// ─── 시뮬레이션 블로그 포스트 ─────────────────────────

const BLOG_TEMPLATES = {
  organic: [
    (name: string) => ({ title: `${name} 솔직 후기`, content: `${name}에 다녀왔습니다. 분위기도 좋고 만족스러웠어요.` }),
    (name: string) => ({ title: `${name} 방문 리뷰`, content: `줄이 좀 길었지만 기다릴 만한 가치가 있었습니다. 재방문 의사 있어요.` }),
    (name: string) => ({ title: `${name} 강추합니다`, content: `친구 추천으로 갔는데 정말 좋았어요. 꼭 들르세요.` }),
    (name: string) => ({ title: `${name} 재방문 후기`, content: `작년에 이어 올해도 방문. 여전히 좋고 서비스도 괜찮습니다.` }),
    (name: string) => ({ title: `${name} 혼자 방문 후기`, content: `혼자 가기에도 좋은 곳이에요. 편하고 분위기 좋습니다.` }),
  ],
  suspected: [
    (name: string) => ({ title: `[내돈내산] ${name} 리뷰`, content: `내돈내산으로 다녀온 ${name}! 솔직후기 남깁니다. 가격 대비 만족.` }),
  ],
  ad: [
    (name: string) => ({ title: `${name} 체험단 후기`, content: `체험단으로 방문했습니다. 소정의 원고료를 받아 작성한 글입니다.` }),
    (name: string) => ({ title: `${name} 협찬 리뷰`, content: `#광고 #협찬 업체로부터 제공받아 작성한 포스팅입니다.` }),
  ],
};

function generateBlogPosts(placeName: string): BlogPost[] {
  const posts: BlogPost[] = [];
  let idx = 0;

  // 진짜 후기 5건
  for (const tmpl of BLOG_TEMPLATES.organic) {
    const { title, content } = tmpl(placeName);
    posts.push({
      url: `https://blog.naver.com/sim_${idx++}/${encodeURIComponent(placeName)}`,
      title,
      content_snippet: content,
      ad_analysis: analyzeAdByRules(content),
    });
  }

  // 의심 1건
  for (const tmpl of BLOG_TEMPLATES.suspected) {
    const { title, content } = tmpl(placeName);
    posts.push({
      url: `https://blog.naver.com/sim_${idx++}/${encodeURIComponent(placeName)}`,
      title,
      content_snippet: content,
      ad_analysis: analyzeAdByRules(content),
    });
  }

  // 광고 2건
  for (const tmpl of BLOG_TEMPLATES.ad) {
    const { title, content } = tmpl(placeName);
    posts.push({
      url: `https://blog.naver.com/sim_${idx++}/${encodeURIComponent(placeName)}`,
      title,
      content_snippet: content,
      ad_analysis: analyzeAdByRules(content),
    });
  }

  return posts;
}

// ─── 시뮬레이션 Google 리뷰 ──────────────────────────

function generateGoogleData(placeName: string): GoogleData {
  // 장소 이름의 해시를 시드로 사용해 일관된 데이터 생성
  let hash = 0;
  for (let i = 0; i < placeName.length; i++) {
    hash = ((hash << 5) - hash + placeName.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);

  return {
    rating: 3.5 + (seed % 15) * 0.1,           // 3.5 ~ 4.9
    total_reviews: 50 + (seed % 20) * 100,      // 50 ~ 1950
    recent_reviews_3m: 5 + (seed % 10) * 8,     // 5 ~ 77
    recent_positive_ratio: 0.55 + (seed % 9) * 0.05,  // 0.55 ~ 0.95
    sentiment_score: 0.50 + (seed % 10) * 0.05,       // 0.50 ~ 0.95
  };
}

// ─── 메인 함수 ─────────────────────────────────────────

export async function analyzePlaces(
  places: NormalizedPlace[],
  regionType: 'domestic' | 'overseas',
): Promise<PlaceAnalysis[]> {
  return places.map(place => {
    const blogPosts = generateBlogPosts(place.name);
    const organicPosts = blogPosts.filter(p => p.ad_analysis.final_verdict === 'organic');
    const confirmedAds = blogPosts.filter(p => p.ad_analysis.final_verdict === 'confirmed_ad');

    const google = generateGoogleData(place.name);

    const kakao: KakaoData | null = regionType === 'domestic'
      ? {
          rating: 3.5 + (place.name.length % 15) * 0.1,
          total_reviews: 30 + (place.name.length % 12) * 25,
        }
      : null;

    const blog: BlogData = {
      mention_count: place.mention_count,
      total_posts: blogPosts.length,
      organic_count: organicPosts.length,
      confirmed_ad_count: confirmedAds.length,
      avg_organic_sentiment: 0.65 + (place.name.length % 7) * 0.05,
    };

    return { place, google, kakao, blog, blog_posts: blogPosts };
  });
}
