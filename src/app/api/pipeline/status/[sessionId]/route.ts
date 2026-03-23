// 파이프라인 진행 상태 조회 — GET /api/pipeline/status/[sessionId]
// 현재 단계, 각 단계 결과, 진행률 반환
// 인메모리 상태 → Supabase 폴백 순서로 조회

import { NextRequest, NextResponse } from 'next/server';
import { getPipelineState } from '@/lib/pipeline/orchestrator';
import { createServiceClient } from '@/lib/supabase';

const STAGE_ORDER = ['collecting', 'normalizing', 'analyzing', 'scoring', 'saving'];

const STAGE_PROGRESS: Record<string, { current: number; message: string }> = {
  collecting: { current: 1, message: '후보 장소를 수집하고 있습니다...' },
  normalizing: { current: 2, message: '중복 장소를 제거하고 있습니다...' },
  analyzing: { current: 3, message: '장소를 분석하고 있습니다...' },
  scoring: { current: 4, message: '신뢰도 점수를 계산하고 있습니다...' },
  saving: { current: 5, message: '결과를 저장하고 있습니다...' },
  completed: { current: 5, message: '리서치 완료!' },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;

  // 1) 인메모리 상태 확인 (같은 인스턴스에서 실행 중일 때)
  const state = getPipelineState(sessionId);

  if (state) {
    const isCompleted = state.current_stage === 'completed';
    const isFailed = state.current_stage === 'failed';

    return NextResponse.json({
      session_id: sessionId,
      status: isCompleted ? 'completed' : isFailed ? 'failed' : 'processing',
      current_stage: state.current_stage,
      progress: state.progress,
      stages: Object.values(state.stages).map(stage => ({
        stage: stage.stage,
        status: stage.status,
        started_at: stage.started_at,
        completed_at: stage.completed_at,
        result: stage.result,
        error: stage.error,
      })),
      results_url: isCompleted ? `/api/results/${sessionId}` : null,
    });
  }

  // 2) 인메모리에 없으면 Supabase에서 폴백 조회
  //    (다른 서버리스 인스턴스에서 파이프라인이 실행 중일 수 있음)
  try {
    const db = createServiceClient();
    const { data: session } = await db
      .from('search_sessions')
      .select('status, current_stage, progress_message')
      .eq('id', sessionId)
      .single();

    if (session) {
      const dbStage = session.current_stage ?? session.status ?? 'collecting';
      const isCompleted = session.status === 'completed';
      const isFailed = session.status === 'failed';

      const progressInfo = STAGE_PROGRESS[dbStage] ?? { current: 0, message: session.progress_message ?? '처리 중...' };

      // Supabase 폴백: 상세 단계 정보 없이 기본 진행률만 반환
      const stages = STAGE_ORDER.map(stageName => {
        const stageIdx = STAGE_ORDER.indexOf(stageName);
        const currentIdx = STAGE_ORDER.indexOf(dbStage);
        let stageStatus: string = 'pending';
        if (isCompleted || stageIdx < currentIdx) stageStatus = 'completed';
        else if (stageIdx === currentIdx && !isCompleted && !isFailed) stageStatus = 'in_progress';
        else if (isFailed && stageIdx === currentIdx) stageStatus = 'failed';

        return {
          stage: stageName,
          status: stageStatus,
          started_at: null,
          completed_at: null,
          result: null,
          error: null,
        };
      });

      return NextResponse.json({
        session_id: sessionId,
        status: isCompleted ? 'completed' : isFailed ? 'failed' : 'processing',
        current_stage: dbStage,
        progress: {
          current: progressInfo.current,
          total: 5,
          message: session.progress_message ?? progressInfo.message,
        },
        stages,
        results_url: isCompleted ? `/api/results/${sessionId}` : null,
      });
    }
  } catch (err) {
    console.warn('[status] Supabase 폴백 조회 실패:', err);
  }

  return NextResponse.json(
    { error: '세션을 찾을 수 없습니다.', session_id: sessionId },
    { status: 404 },
  );
}
