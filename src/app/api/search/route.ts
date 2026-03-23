// 검색 시작 엔드포인트 — 세션 생성 → 파이프라인 비동기 시작 → 즉시 sessionId 반환
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { startPipelineAsync, getPipelineState, initState } from '@/lib/pipeline/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { destination, category, excludePlaceIds } = body;

    if (!destination) {
      return NextResponse.json(
        { error: '여행지를 입력해주세요.' },
        { status: 400 },
      );
    }

    // 초기값은 domestic — collect 단계에서 실제 주소 기반으로 재결정됨
    const regionType = 'domestic' as 'domestic' | 'overseas';
    const cat = category ?? '맛집';
    const query = `${destination} ${cat}`;

    // 세션 생성
    let sessionId: string;

    const db = getDb();
    if (db) {
      const { data, error } = await db
        .from('search_sessions')
        .insert({
          query,
          destination,
          category: cat,
          region_type: regionType,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error || !data) {
        console.warn('[search] Supabase 세션 생성 실패, UUID 생성:', error?.message);
        sessionId = crypto.randomUUID();
      } else {
        sessionId = data.id;
      }
    } else {
      sessionId = crypto.randomUUID();
    }

    // 응답 전에 상태를 먼저 초기화 — 클라이언트 폴링 시 404 방지
    initState(sessionId);

    // 파이프라인 비동기 시작
    startPipelineAsync(sessionId, destination, cat, regionType, excludePlaceIds);

    return NextResponse.json({
      session_id: sessionId,
      query,
      destination,
      category: cat,
      region_type: regionType,
      status: 'processing',
      status_url: `/api/pipeline/status/${sessionId}`,
      results_url: `/api/results/${sessionId}`,
    });
  } catch (error) {
    console.error('[search] 요청 처리 실패:', error);
    return NextResponse.json(
      { error: '검색 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

// 완료된 세션 결과를 직접 가져오는 동기 엔드포인트 (테스트용)
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id 파라미터가 필요합니다.' }, { status: 400 });
  }

  const state = getPipelineState(sessionId);
  if (!state) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({
    session_id: sessionId,
    current_stage: state.current_stage,
    progress: state.progress,
  });
}

function getDb() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

// isOverseas 하드코딩 제거됨 — collect 단계에서 수집된 장소 주소 기반으로 동적 판별
