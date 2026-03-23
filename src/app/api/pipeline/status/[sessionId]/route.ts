// 파이프라인 진행 상태 조회 — GET /api/pipeline/status/[sessionId]
// 현재 단계, 각 단계 결과, 진행률 반환

import { NextRequest, NextResponse } from 'next/server';
import { getPipelineState } from '@/lib/pipeline/orchestrator';

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;
  const state = getPipelineState(sessionId);

  if (!state) {
    return NextResponse.json(
      { error: '세션을 찾을 수 없습니다.', session_id: sessionId },
      { status: 404 },
    );
  }

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
