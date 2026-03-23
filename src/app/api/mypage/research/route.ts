// 마이페이지 리서치 히스토리 — GET /api/mypage/research
// 인메모리 파이프라인 상태 + DB에서 세션 목록 조회

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAllPipelineStates, getPipelineResults } from '@/lib/pipeline/orchestrator';
import { createServiceClient } from '@/lib/supabase';

export async function GET() {
  const research: Array<{
    id: string;
    query: string;
    status: 'completed' | 'processing' | 'failed';
    verified: number;
    avgScore: number;
    date: string;
  }> = [];

  // 인메모리 파이프라인 상태에서 가져오기
  const states = getAllPipelineStates();
  for (const [sessionId, state] of Array.from(states.entries())) {
    const scoreResult = state.stages.scoring?.result as Record<string, unknown> | null;
    const query = state.query ?? sessionId.slice(0, 8);

    const status = state.current_stage === 'completed'
      ? 'completed' as const
      : state.current_stage === 'failed'
      ? 'failed' as const
      : 'processing' as const;

    research.push({
      id: sessionId,
      query: query,
      status,
      verified: (scoreResult?.total_scored as number) ?? 0,
      avgScore: (scoreResult?.avg_trust_score as number) ?? 0,
      date: state.stages.collecting?.started_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
    });
  }

  // DB에서도 세션 가져오기 (인메모리에 없는 것)
  try {
    const db = createServiceClient();
    const { data: sessions } = await db
      .from('search_sessions')
      .select('id, query, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (sessions) {
      const existingIds = new Set(research.map(r => r.id));
      for (const s of sessions) {
        if (existingIds.has(s.id)) continue;

        // 이 세션의 점수 정보도 가져오기
        const { data: scores } = await db
          .from('places')
          .select('trust_scores(final_score)')
          .eq('session_id', s.id);

        const finalScores = (scores ?? [])
          .map((p: Record<string, unknown>) => {
            const ts = p.trust_scores as Record<string, unknown> | null;
            return ts?.final_score as number | undefined;
          })
          .filter((v): v is number => v != null);

        const avgScore = finalScores.length > 0
          ? Math.round((finalScores.reduce((a, b) => a + b, 0) / finalScores.length) * 10) / 10
          : 0;

        research.push({
          id: s.id,
          query: s.query,
          status: s.status === 'completed' ? 'completed' : s.status === 'failed' ? 'failed' : 'processing',
          verified: finalScores.length,
          avgScore,
          date: s.created_at?.split('T')[0] ?? '',
        });
      }
    }
  } catch {
    // DB 미연결 시 무시
  }

  // 파일 저장소에서도 가져오기
  try {
    const { listResults } = await import('@/lib/pipeline/result-store');
    const fileResults = await listResults();
    const existingIds = new Set(research.map(r => r.id));

    for (const fr of fileResults) {
      if (existingIds.has(fr.session_id)) continue;
      research.push({
        id: fr.session_id,
        query: fr.query,
        status: 'completed',
        verified: fr.verified,
        avgScore: fr.avg_trust_score,
        date: fr.created_at.split('T')[0],
      });
    }
  } catch {}

  // 날짜 역순 정렬 + 중복 제거
  const seen = new Set<string>();
  const deduped = research.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  deduped.sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ research: deduped });
}
