// 완료된 리서치 결과 — GET /api/results/[sessionId]
// 장소 리스트 + trust_scores + breakdowns

import { NextRequest, NextResponse } from 'next/server';
import { getPipelineState, getPipelineResults } from '@/lib/pipeline/orchestrator';
import { createServiceClient } from '@/lib/supabase';

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;

  // 먼저 인메모리 상태에서 확인
  const state = getPipelineState(sessionId);

  if (state && state.current_stage !== 'completed') {
    return NextResponse.json({
      session_id: sessionId,
      status: state.current_stage === 'failed' ? 'failed' : 'processing',
      current_stage: state.current_stage,
      progress: state.progress,
      message: '리서치가 아직 완료되지 않았습니다.',
      status_url: `/api/pipeline/status/${sessionId}`,
    }, { status: 202 });
  }

  // 인메모리 결과가 있으면 우선 사용 (blog_posts 등 상세 데이터 포함)
  // DB에는 blog URL unique constraint 등으로 불완전한 데이터가 저장될 수 있으므로
  if (state && state.current_stage === 'completed') {
    const scored = getPipelineResults(sessionId);
    const analyzeResult = state.stages.analyzing?.result as Record<string, unknown> | null;
    const scoreResult = state.stages.scoring?.result as Record<string, unknown> | null;
    const collectResult = state.stages.collecting?.result as Record<string, unknown> | null;

    return NextResponse.json({
      session_id: sessionId,
      status: 'completed',
      summary: {
        total_places: (collectResult?.total as number) ?? 0,
        total_blog_posts: (analyzeResult?.total_blog_posts as number) ?? 0,
        ads_removed: (analyzeResult?.total_ads_detected as number) ?? 0,
        verified: (scoreResult?.total_scored as number) ?? 0,
        avg_trust_score: (scoreResult?.avg_trust_score as number) ?? 0,
      },
      results: scored
        ? scored.map((s, i) => ({
            rank: i + 1,
            name: s.name,
            address: s.address,
            category: s.category,
            location: { lat: s.latitude, lng: s.longitude },
            mention_count: s.mention_count,
            sources: s.sources,
            google_place_id: s.google_place_id,
            trust_score: s.score.final_score,
            sub_scores: {
              google: s.score.google_sub_score,
              kakao: s.score.kakao_sub_score,
              blog: s.score.blog_sub_score,
            },
            weights: s.score.weight_profile,
            ad_penalty: s.score.ad_penalty,
            freshness_bonus: s.score.freshness_bonus,
            breakdown: s.breakdown,
            blog_analysis: {
              total: s.blog_posts.length,
              organic: s.blog_posts.filter(p => p.ad_analysis.final_verdict === 'organic').length,
              suspected: s.blog_posts.filter(p => p.ad_analysis.final_verdict === 'suspected_ad').length,
              confirmed_ad: s.blog_posts.filter(p => p.ad_analysis.final_verdict === 'confirmed_ad').length,
            },
            blog_posts: s.blog_posts.map(p => ({
              url: p.url,
              title: p.title,
              content_snippet: p.content_snippet,
              thumbnail: p.thumbnail,
              ad_status: p.ad_analysis.final_verdict,
              ad_analysis: {
                rule_result: p.ad_analysis.rule_result,
                detected_keywords: p.ad_analysis.detected_keywords,
                final_verdict: p.ad_analysis.final_verdict,
                ad_confidence: p.ad_analysis.ad_confidence,
              },
            })),
          }))
        : [],
    });
  }

  // 파일에서 복원 시도
  try {
    const { loadResult } = await import('@/lib/pipeline/result-store');
    const fileResult = await loadResult(sessionId);
    if (fileResult) {
      return NextResponse.json({
        session_id: fileResult.session_id,
        status: 'completed',
        summary: fileResult.summary,
        results: fileResult.results,
      });
    }
  } catch {}

  // DB 폴백
  const db = getDb();
  if (db) {
    const dbResult = await fetchResultsFromDb(db, sessionId);
    if (dbResult) return NextResponse.json(dbResult);
  }

  return NextResponse.json(
    { error: '세션을 찾을 수 없습니다.', session_id: sessionId },
    { status: 404 },
  );
}

function getDb() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

async function fetchResultsFromDb(
  db: ReturnType<typeof createServiceClient>,
  sessionId: string,
) {
  const { data: session } = await db
    .from('search_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) return null;

  const { data: places } = await db
    .from('places')
    .select(`
      *,
      trust_scores (*),
      google_reviews (*),
      kakao_reviews (*),
      blog_posts (
        *,
        ad_analyses (*)
      )
    `)
    .eq('session_id', sessionId)
    .order('trust_scores(final_score)', { ascending: false });

  if (!places || places.length === 0) return null;

  const totalPlaces = places.length;
  const totalBlogPosts = places.reduce(
    (sum: number, p: Record<string, unknown>) => sum + ((p.blog_posts as unknown[])?.length ?? 0),
    0,
  );
  const totalAds = places.reduce(
    (sum: number, p: Record<string, unknown>) =>
      sum + ((p.blog_posts as Array<{ ad_status: string }>)?.filter(b => b.ad_status === 'confirmed_ad').length ?? 0),
    0,
  );
  const scores = places
    .map((p: Record<string, unknown>) => {
      const ts = p.trust_scores as Record<string, unknown> | null;
      return ts?.final_score as number | undefined;
    })
    .filter((s): s is number => s != null);
  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : 0;

  return {
    session_id: sessionId,
    status: session.status,
    query: session.query,
    destination: session.destination,
    category: session.category,
    region_type: session.region_type,
    created_at: session.created_at,
    completed_at: session.completed_at,
    summary: {
      total_places: totalPlaces,
      total_blog_posts: totalBlogPosts,
      ads_removed: totalAds,
      verified: totalPlaces,
      avg_trust_score: avgScore,
    },
    results: places.map((p: Record<string, unknown>, i: number) => {
      const ts = (p.trust_scores as Record<string, unknown>) ?? {};
      const blogPosts = p.blog_posts as Array<Record<string, unknown>> | null;

      return {
        rank: i + 1,
        place_id: p.id,
        name: p.name,
        address: p.address,
        category: p.category,
        location: { lat: p.latitude, lng: p.longitude },
        mention_count: p.mention_count,
        trust_score: ts.final_score ?? 0,
        sub_scores: {
          google: ts.google_sub_score ?? 0,
          kakao: ts.kakao_sub_score ?? 0,
          blog: ts.blog_sub_score ?? 0,
        },
        weights: ts.weight_profile ?? {},
        ad_penalty: ts.ad_penalty ?? 0,
        freshness_bonus: ts.freshness_bonus ?? 0,
        breakdown: ts.breakdown_json ?? {},
        blog_analysis: {
          total: blogPosts?.length ?? 0,
          organic: blogPosts?.filter(b => b.ad_status === 'organic').length ?? 0,
          suspected: blogPosts?.filter(b => b.ad_status === 'suspected_ad').length ?? 0,
          confirmed_ad: blogPosts?.filter(b => b.ad_status === 'confirmed_ad').length ?? 0,
        },
        blog_posts: (blogPosts ?? []).map(b => ({
          url: b.url,
          title: b.title,
          content_snippet: b.content_summary,
          ad_status: b.ad_status,
          ad_analysis: (b.ad_analyses as Array<Record<string, unknown>>)?.[0] ?? null,
        })),
      };
    }),
  };
}
