// 파이프라인 실행 엔드포인트 — POST /api/pipeline/run/[sessionId]
// 동기 실행: 응답을 보내지 않으므로 서버리스 함수가 파이프라인 완료까지 유지됨
// 멱등성: 이미 실행 중이거나 완료된 세션은 무시

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline, initState, getPipelineState } from '@/lib/pipeline/orchestrator';
import { createServiceClient } from '@/lib/supabase';

// Vercel 서버리스 함수 타임아웃 (Hobby: 최대 60초, Pro: 최대 300초)
export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;

  // 이미 실행 중이거나 완료된 세션은 스킵 (멱등성)
  const existing = getPipelineState(sessionId);
  if (existing && existing.current_stage !== 'collecting') {
    // 이미 진행 중
    return NextResponse.json({
      session_id: sessionId,
      status: existing.current_stage === 'completed' ? 'completed' : 'already_running',
    });
  }

  // Supabase에서 세션 정보 조회
  let destination = '';
  let category = '맛집';
  let regionType: 'domestic' | 'overseas' = 'domestic';

  try {
    const db = createServiceClient();
    const { data: session } = await db
      .from('search_sessions')
      .select('destination, category, region_type, status')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이미 완료된 세션
    if (session.status === 'completed') {
      return NextResponse.json({ session_id: sessionId, status: 'completed' });
    }

    destination = session.destination;
    category = session.category;
    regionType = session.region_type ?? 'domestic';
  } catch (err) {
    console.error('[pipeline/run] Supabase 조회 실패:', err);
    return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
  }

  // 파이프라인 상태 초기화 + 동기 실행
  initState(sessionId);

  try {
    const result = await runPipeline(sessionId, destination, category, regionType);

    return NextResponse.json({
      session_id: sessionId,
      status: result.status,
      total_places: result.scored_places.length,
    });
  } catch (err) {
    console.error('[pipeline/run] 파이프라인 실패:', err);
    return NextResponse.json({
      session_id: sessionId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
