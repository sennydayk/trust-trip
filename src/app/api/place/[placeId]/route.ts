// 장소 상세 분석 — GET /api/place/[placeId]
// 모든 소스 데이터 + 광고 판별 + 블로그 리스트

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET(
  _request: NextRequest,
  { params }: { params: { placeId: string } },
) {
  const { placeId } = params;

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: 'DB 연결이 설정되지 않았습니다.', place_id: placeId },
      { status: 503 },
    );
  }

  // 장소 기본 정보
  const { data: place, error: placeError } = await db
    .from('places')
    .select('*')
    .eq('id', placeId)
    .single();

  if (placeError || !place) {
    return NextResponse.json(
      { error: '장소를 찾을 수 없습니다.', place_id: placeId },
      { status: 404 },
    );
  }

  // 병렬로 관련 데이터 조회
  const [
    { data: trustScore },
    { data: googleReviews },
    { data: kakaoReviews },
    { data: blogPosts },
  ] = await Promise.all([
    db.from('trust_scores').select('*').eq('place_id', placeId).single(),
    db.from('google_reviews').select('*').eq('place_id', placeId).order('fetched_at', { ascending: false }).limit(1),
    db.from('kakao_reviews').select('*').eq('place_id', placeId).order('fetched_at', { ascending: false }).limit(1),
    db.from('blog_posts').select(`*, ad_analyses (*)`).eq('place_id', placeId).order('published_at', { ascending: false }),
  ]);

  const posts = blogPosts ?? [];
  const organicPosts = posts.filter(p => p.ad_status === 'organic');
  const suspectedPosts = posts.filter(p => p.ad_status === 'suspected_ad');
  const confirmedAdPosts = posts.filter(p => p.ad_status === 'confirmed_ad');

  return NextResponse.json({
    place_id: placeId,
    name: place.name,
    normalized_name: place.normalized_name,
    category: place.category,
    location: { lat: place.latitude, lng: place.longitude },
    address: place.address,
    country: place.country,
    mention_count: place.mention_count,
    google_place_id: place.google_place_id,

    // 신뢰도 점수
    trust_score: trustScore ? {
      final_score: trustScore.final_score,
      sub_scores: {
        google: trustScore.google_sub_score,
        kakao: trustScore.kakao_sub_score,
        blog: trustScore.blog_sub_score,
      },
      weights: trustScore.weight_profile,
      ad_penalty: trustScore.ad_penalty,
      freshness_bonus: trustScore.freshness_bonus,
      breakdown: trustScore.breakdown_json,
      calculated_at: trustScore.calculated_at,
    } : null,

    // Google Maps 데이터
    google: googleReviews?.[0] ? {
      rating: googleReviews[0].rating,
      total_reviews: googleReviews[0].total_reviews,
      recent_reviews_3m: googleReviews[0].recent_reviews_3m,
      recent_positive_ratio: googleReviews[0].recent_positive_ratio,
      sentiment_score: googleReviews[0].sentiment_score,
      fetched_at: googleReviews[0].fetched_at,
    } : null,

    // 카카오맵 데이터
    kakao: kakaoReviews?.[0] ? {
      rating: kakaoReviews[0].rating,
      total_reviews: kakaoReviews[0].total_reviews,
      category_tags: kakaoReviews[0].category_tags,
      fetched_at: kakaoReviews[0].fetched_at,
    } : null,

    // 블로그 분석 요약
    blog_summary: {
      total: posts.length,
      organic: organicPosts.length,
      suspected: suspectedPosts.length,
      confirmed_ad: confirmedAdPosts.length,
    },

    // 블로그 리스트 (광고 판별 포함)
    blog_posts: posts.map(post => ({
      id: post.id,
      url: post.url,
      title: post.title,
      content_summary: post.content_summary,
      ad_status: post.ad_status,
      sentiment_score: post.sentiment_score,
      image_count: post.image_count,
      text_length: post.text_length,
      published_at: post.published_at,
      ad_analysis: post.ad_analyses?.[0] ? {
        rule_result: post.ad_analyses[0].rule_result,
        llm_result: post.ad_analyses[0].llm_result,
        ad_confidence: post.ad_analyses[0].ad_confidence,
        detected_keywords: post.ad_analyses[0].detected_keywords,
        final_verdict: post.ad_analyses[0].final_verdict,
        analyzed_at: post.ad_analyses[0].analyzed_at,
      } : null,
    })),
  });
}

function getDb() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}
