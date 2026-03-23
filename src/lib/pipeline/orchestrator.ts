// 파이프라인 오케스트레이터 — 스펙 섹션 3
// 5단계: 수집 → 정규화 → 분석(병렬) → 점수 계산 → DB 저장
// 각 단계 완료 시 Supabase에 상태 업데이트, 에러 시 해당 장소만 건너뛰기

import { createServiceClient } from '@/lib/supabase';
import { collectPlaces, type CollectResult } from './stages/collect';
import { normalizeCandidates, type NormalizeResult } from './stages/normalize';
import { analyzePlaces, type PlaceAnalysis } from './stages/analyze';
import { scorePlaces, type ScoredPlace } from './stages/score';
import type { NormalizedPlace } from '@/lib/analyzers/normalizer';

// ─── 타입 정의 ─────────────────────────────────────────

export type PipelineStage =
  | 'collecting'
  | 'normalizing'
  | 'analyzing'
  | 'scoring'
  | 'saving'
  | 'completed'
  | 'failed';

export interface StageResult {
  stage: PipelineStage;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  result: unknown;
  error: string | null;
}

export interface PipelineState {
  session_id: string;
  query?: string;
  destination?: string;
  category?: string;
  current_stage: PipelineStage;
  stages: Record<string, StageResult>;
  progress: {
    current: number;
    total: number;
    message: string;
  };
}

export interface PipelineResult {
  session_id: string;
  status: 'completed' | 'failed';
  scored_places: ScoredPlace[];
  pipeline_state: PipelineState;
}

// ─── 진행 상태 인메모리 저장소 ────────────────────────
// globalThis에 저장하여 Next.js HMR 및 다중 워커 환경에서도 유지

const GLOBAL_KEY = '__trusttrip_pipeline_states__';
const GLOBAL_RESULTS_KEY = '__trusttrip_pipeline_results__';

function getStatesMap(): Map<string, PipelineState> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, PipelineState>();
  }
  return g[GLOBAL_KEY] as Map<string, PipelineState>;
}

function getResultsMap(): Map<string, ScoredPlace[]> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_RESULTS_KEY]) {
    g[GLOBAL_RESULTS_KEY] = new Map<string, ScoredPlace[]>();
  }
  return g[GLOBAL_RESULTS_KEY] as Map<string, ScoredPlace[]>;
}

export function getPipelineState(sessionId: string): PipelineState | null {
  return getStatesMap().get(sessionId) ?? null;
}

export function getAllPipelineStates(): Map<string, PipelineState> {
  return getStatesMap();
}

export function getPipelineResults(sessionId: string): ScoredPlace[] | null {
  return getResultsMap().get(sessionId) ?? null;
}

export function initState(sessionId: string): PipelineState {
  const stageNames = ['collecting', 'normalizing', 'analyzing', 'scoring', 'saving'] as const;

  const stages: Record<string, StageResult> = {};
  for (const name of stageNames) {
    stages[name] = {
      stage: name,
      status: 'pending',
      started_at: null,
      completed_at: null,
      result: null,
      error: null,
    };
  }

  const state: PipelineState = {
    session_id: sessionId,
    current_stage: 'collecting',
    stages,
    progress: { current: 0, total: 5, message: '파이프라인 시작' },
  };

  getStatesMap().set(sessionId, state);
  return state;
}

function updateStage(
  state: PipelineState,
  stage: string,
  update: Partial<StageResult>,
) {
  if (state.stages[stage]) {
    Object.assign(state.stages[stage], update);
  }
}

// ─── Supabase 헬퍼 ────────────────────────────────────

function getDb() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

async function updateSessionStatus(
  sessionId: string,
  status: string,
  extra?: { completed_at?: string; current_stage?: string; progress_message?: string },
) {
  const db = getDb();
  if (!db) return;

  try {
    const update: Record<string, unknown> = { status };
    if (extra?.completed_at) update.completed_at = extra.completed_at;
    if (extra?.current_stage) update.current_stage = extra.current_stage;
    if (extra?.progress_message) update.progress_message = extra.progress_message;

    const { error } = await db
      .from('search_sessions')
      .update(update)
      .eq('id', sessionId);

    if (error) console.warn('[orchestrator] 세션 상태 업데이트 실패:', error.message);
  } catch (err) {
    console.warn('[orchestrator] 세션 상태 업데이트 실패:', err);
  }
}

async function savePlacesToDb(
  sessionId: string,
  places: NormalizedPlace[],
): Promise<Map<string, string>> {
  const db = getDb();
  const placeIdMap = new Map<string, string>();
  if (!db) return placeIdMap;

  for (const place of places) {
    try {
      const { data, error } = await db
        .from('places')
        .insert({
          session_id: sessionId,
          name: place.name,
          normalized_name: place.normalized_name,
          category: place.category,
          latitude: place.latitude,
          longitude: place.longitude,
          address: place.address,
          mention_count: place.mention_count,
          google_place_id: place.google_place_id,
        })
        .select('id')
        .single();

      if (data) {
        placeIdMap.set(place.normalized_name, data.id);
      } else if (error) {
        console.warn(`[orchestrator] 장소 저장 실패: ${place.name}`, error.message);
      }
    } catch (err) {
      console.warn(`[orchestrator] 장소 저장 실패: ${place.name}`, err);
    }
  }

  return placeIdMap;
}

async function saveAnalysisToDb(
  placeIdMap: Map<string, string>,
  analyses: PlaceAnalysis[],
) {
  const db = getDb();
  if (!db) return;

  for (const analysis of analyses) {
    const placeId = placeIdMap.get(analysis.place.normalized_name);
    if (!placeId) continue;

    // Google 리뷰 저장
    if (analysis.google) {
      try {
        const { error } = await db
          .from('google_reviews')
          .insert({
            place_id: placeId,
            rating: analysis.google.rating,
            total_reviews: analysis.google.total_reviews,
            recent_reviews_3m: analysis.google.recent_reviews_3m,
            recent_positive_ratio: analysis.google.recent_positive_ratio,
            sentiment_score: analysis.google.sentiment_score,
          });
        if (error) console.warn('[orchestrator] Google 리뷰 저장 실패:', error.message);
      } catch (err) {
        console.warn('[orchestrator] Google 리뷰 저장 실패:', err);
      }
    }

    // 카카오 리뷰 저장
    if (analysis.kakao) {
      try {
        const { error } = await db
          .from('kakao_reviews')
          .insert({
            place_id: placeId,
            rating: analysis.kakao.rating,
            total_reviews: analysis.kakao.total_reviews,
          });
        if (error) console.warn('[orchestrator] 카카오 리뷰 저장 실패:', error.message);
      } catch (err) {
        console.warn('[orchestrator] 카카오 리뷰 저장 실패:', err);
      }
    }

    // 블로그 포스트 + 광고 분석 저장
    for (const post of analysis.blog_posts) {
      try {
        const { data: blogData, error: blogError } = await db
          .from('blog_posts')
          .insert({
            place_id: placeId,
            url: post.url,
            title: post.title,
            content_summary: post.content_snippet,
            ad_status: post.ad_analysis.final_verdict,
          })
          .select('id')
          .single();

        if (blogError) {
          console.warn('[orchestrator] 블로그 저장 실패:', blogError.message);
          continue;
        }

        if (blogData) {
          const { error: adError } = await db
            .from('ad_analyses')
            .insert({
              blog_post_id: blogData.id,
              rule_result: post.ad_analysis.rule_result,
              llm_result: post.ad_analysis.llm_result,
              ad_confidence: post.ad_analysis.ad_confidence,
              detected_keywords: post.ad_analysis.detected_keywords,
              final_verdict: post.ad_analysis.final_verdict,
            });
          if (adError) console.warn('[orchestrator] 광고 분석 저장 실패:', adError.message);
        }
      } catch (err) {
        console.warn('[orchestrator] 블로그/광고 저장 실패:', err);
      }
    }
  }
}

async function saveScoresToDb(
  placeIdMap: Map<string, string>,
  scored: ScoredPlace[],
  analyses: PlaceAnalysis[],
) {
  const db = getDb();
  if (!db) return;

  for (const place of scored) {
    const analysis = analyses.find(a => a.place.name === place.name);
    const placeId = analysis
      ? placeIdMap.get(analysis.place.normalized_name)
      : undefined;
    if (!placeId) continue;

    try {
      const { error } = await db
        .from('trust_scores')
        .upsert({
          place_id: placeId,
          google_sub_score: place.score.google_sub_score,
          kakao_sub_score: place.score.kakao_sub_score,
          blog_sub_score: place.score.blog_sub_score,
          ad_penalty: place.score.ad_penalty,
          freshness_bonus: place.score.freshness_bonus,
          final_score: place.score.final_score,
          weight_profile: place.score.weight_profile,
          breakdown_json: place.breakdown,
        });
      if (error) console.warn('[orchestrator] 점수 저장 실패:', error.message);
    } catch (err) {
      console.warn('[orchestrator] 점수 저장 실패:', err);
    }
  }
}

// ─── 메인 파이프라인 ──────────────────────────────────

export async function runPipeline(
  sessionId: string,
  destination: string,
  category: string,
  initialRegionType: 'domestic' | 'overseas',
  excludePlaceIds?: string[],
): Promise<PipelineResult> {
  // collect 단계에서 실제 주소 기반으로 재결정됨
  let regionType: 'domestic' | 'overseas' = initialRegionType;

  const state = getPipelineState(sessionId) ?? initState(sessionId);
  state.query = `${destination} ${category}`;
  state.destination = destination;
  state.category = category;

  let collectResult: CollectResult | null = null;
  let normalizeResult: NormalizeResult | null = null;
  let analyses: PlaceAnalysis[] = [];
  let scored: ScoredPlace[] = [];

  try {
    // ── 1단계: 후보 수집 ─────────────────────────────
    state.current_stage = 'collecting';
    state.progress = { current: 1, total: 5, message: '후보 장소를 수집하고 있습니다...' };
    updateStage(state, 'collecting', {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });
    await updateSessionStatus(sessionId, 'processing', {
      current_stage: 'collecting',
      progress_message: '후보 장소를 수집하고 있습니다...',
    });

    collectResult = await collectPlaces(destination, category, excludePlaceIds);

    // 수집된 장소 주소에서 국내/해외 동적 판별 (하드코딩 대체)
    regionType = collectResult.detectedRegionType;
    console.log(`[orchestrator] 지역 판별: ${regionType} (수집 데이터 기반)`);

    updateStage(state, 'collecting', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { ...collectResult.stats, region_type: regionType },
    });

    // ── 2단계: 장소 정규화 ───────────────────────────
    state.current_stage = 'normalizing';
    state.progress = {
      current: 2,
      total: 5,
      message: `${collectResult.stats.total}개 후보에서 중복을 제거하고 있습니다...`,
    };
    updateStage(state, 'normalizing', {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });
    await updateSessionStatus(sessionId, 'processing', {
      current_stage: 'normalizing',
      progress_message: state.progress.message,
    });

    normalizeResult = await normalizeCandidates(collectResult.places);

    updateStage(state, 'normalizing', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: normalizeResult.stats,
    });

    // ── 3단계: 데이터 분석 (병렬) ────────────────────
    state.current_stage = 'analyzing';
    state.progress = {
      current: 3,
      total: 5,
      message: `${normalizeResult.stats.after}개 장소를 분석하고 있습니다...`,
    };
    updateStage(state, 'analyzing', {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });
    await updateSessionStatus(sessionId, 'processing', {
      current_stage: 'analyzing',
      progress_message: state.progress.message,
    });

    // 수집 단계의 실제 데이터를 분석 컨텍스트로 전달
    const analysisContext = {
      googleDetails: collectResult.googleDetails,
      blogPosts: collectResult.blogPosts,
      blogsByPlace: collectResult.blogsByPlace,
      destination,
      category,
    };

    // 전체 장소를 한번에 분석 (블로그 분배가 장소 전체를 보고 동작)
    const allPlaces = normalizeResult.places;
    const skippedPlaces: string[] = [];

    try {
      analyses = await analyzePlaces(allPlaces, regionType, analysisContext);
    } catch (err) {
      console.warn('[orchestrator] 일괄 분석 실패, 개별 시도:', err);
      // 폴백: 개별 분석
      for (const place of allPlaces) {
        try {
          const [result] = await analyzePlaces([place], regionType);
          analyses.push(result);
        } catch {
          skippedPlaces.push(place.name);
        }
      }
    }

    const totalBlogPosts = analyses.reduce((sum, a) => sum + a.blog_posts.length, 0);
    const totalAds = analyses.reduce(
      (sum, a) => sum + a.blog_posts.filter(p => p.ad_analysis.final_verdict === 'confirmed_ad').length,
      0,
    );

    updateStage(state, 'analyzing', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: {
        places_analyzed: analyses.length,
        total_blog_posts: totalBlogPosts,
        total_ads_detected: totalAds,
        skipped_places: skippedPlaces,
      },
    });

    // ── 4단계: 신뢰도 점수 계산 ──────────────────────
    state.current_stage = 'scoring';
    state.progress = {
      current: 4,
      total: 5,
      message: `${analyses.length}개 장소의 신뢰도 점수를 계산하고 있습니다...`,
    };
    updateStage(state, 'scoring', {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });
    await updateSessionStatus(sessionId, 'processing', {
      current_stage: 'scoring',
      progress_message: state.progress.message,
    });

    scored = await scorePlaces(analyses, regionType);

    const avgScore = scored.length > 0
      ? Math.round((scored.reduce((sum, s) => sum + s.score.final_score, 0) / scored.length) * 10) / 10
      : 0;

    updateStage(state, 'scoring', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: {
        total_scored: scored.length,
        avg_trust_score: avgScore,
        highest: scored[0] ? { name: scored[0].name, score: scored[0].score.final_score } : null,
        lowest: scored.at(-1) ? { name: scored.at(-1)!.name, score: scored.at(-1)!.score.final_score } : null,
      },
    });

    // ── 5단계: DB 저장 ───────────────────────────────
    state.current_stage = 'saving';
    state.progress = { current: 5, total: 5, message: '결과를 저장하고 있습니다...' };
    updateStage(state, 'saving', {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });
    await updateSessionStatus(sessionId, 'processing', {
      current_stage: 'saving',
      progress_message: '결과를 저장하고 있습니다...',
    });

    const placeIdMap = await savePlacesToDb(sessionId, normalizeResult.places);
    await saveAnalysisToDb(placeIdMap, analyses);
    await saveScoresToDb(placeIdMap, scored, analyses);

    updateStage(state, 'saving', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { saved_places: placeIdMap.size },
    });

    // ── 완료 ─────────────────────────────────────────
    state.current_stage = 'completed';
    state.progress = { current: 5, total: 5, message: '리서치 완료!' };

    // 결과를 인메모리에 저장 (results API에서 사용)
    getResultsMap().set(sessionId, scored);

    // 결과를 파일로 영구 저장 (서버 재시작 후에도 접근 가능)
    const stageAnalyze = state.stages.analyzing?.result as Record<string, unknown> | null;
    const stageScore = state.stages.scoring?.result as Record<string, unknown> | null;
    const stageCollect = state.stages.collecting?.result as Record<string, unknown> | null;

    try {
      const { saveResult } = await import('./result-store');
      await saveResult(sessionId, {
        session_id: sessionId,
        query: state.query ?? '',
        destination: state.destination ?? '',
        category: state.category ?? '',
        region_type: regionType,
        created_at: new Date().toISOString(),
        summary: {
          total_places: (stageCollect?.total as number) ?? 0,
          total_blog_posts: (stageAnalyze?.total_blog_posts as number) ?? 0,
          ads_removed: (stageAnalyze?.total_ads_detected as number) ?? 0,
          verified: (stageScore?.total_scored as number) ?? 0,
          avg_trust_score: (stageScore?.avg_trust_score as number) ?? 0,
        },
        results: scored.map((s, i) => ({
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
        })),
      });
    } catch (err) {
      console.warn('[orchestrator] 결과 파일 저장 실패:', err);
    }

    await updateSessionStatus(sessionId, 'completed', {
      completed_at: new Date().toISOString(),
      current_stage: 'completed',
      progress_message: '리서치 완료!',
    });

    return {
      session_id: sessionId,
      status: 'completed',
      scored_places: scored,
      pipeline_state: state,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[orchestrator] 파이프라인 실패 (session: ${sessionId}):`, errorMsg);

    state.current_stage = 'failed';
    state.progress = { ...state.progress, message: `파이프라인 실패: ${errorMsg}` };

    for (const stage of Object.values(state.stages)) {
      if (stage.status === 'in_progress') {
        stage.status = 'failed';
        stage.error = errorMsg;
        stage.completed_at = new Date().toISOString();
      }
    }

    await updateSessionStatus(sessionId, 'failed', {
      current_stage: 'failed',
      progress_message: `파이프라인 실패: ${errorMsg}`,
    });

    return {
      session_id: sessionId,
      status: 'failed',
      scored_places: scored,
      pipeline_state: state,
    };
  }
}

// ─── 비동기 실행 (fire-and-forget) ────────────────────

export function startPipelineAsync(
  sessionId: string,
  destination: string,
  category: string,
  regionType: 'domestic' | 'overseas',
  excludePlaceIds?: string[],
): void {
  runPipeline(sessionId, destination, category, regionType, excludePlaceIds).catch(err => {
    console.error(`[orchestrator] 비동기 파이프라인 에러 (${sessionId}):`, err);
  });
}
