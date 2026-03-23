'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import ProgressTracker from '@/components/pipeline/ProgressTracker';

// ─── 타입 ──────────────────────────────────────────────

interface StageData {
  stage: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result: Record<string, unknown> | null;
  error: string | null;
}

interface StatusResponse {
  session_id: string;
  status: 'processing' | 'completed' | 'failed';
  current_stage: string;
  progress: { current: number; total: number; message: string };
  stages: StageData[];
}

// ─── 단계별 thinking 메시지 ───────────────────────────

const THINKING_MESSAGES: Record<string, string[]> = {
  collecting: [
    'Google Places API에서 장소를 검색하고 있습니다...',
    '네이버 블로그에서 후기를 수집하고 있습니다...',
    '카카오맵에서 장소 정보를 가져오고 있습니다...',
    '수집된 블로그 본문을 분석하고 있습니다...',
    '검색 결과를 정리하고 있습니다...',
  ],
  normalizing: [
    '좌표 기반으로 중복 장소를 탐지하고 있습니다...',
    '이름 유사도를 비교하여 동일 장소를 병합하고 있습니다...',
    '정규화된 장소 목록을 생성하고 있습니다...',
  ],
  analyzing: [
    '블로그 포스트에서 광고 키워드를 검사하고 있습니다...',
    '의심 시그널을 감지하고 행동 패턴을 분석하고 있습니다...',
    'Google 리뷰 데이터를 매칭하고 있습니다...',
    '각 장소별 블로그를 분배하고 있습니다...',
    '광고 판별 결과를 집계하고 있습니다...',
  ],
  scoring: [
    '소스별 서브점수를 계산하고 있습니다...',
    '동적 가중치를 적용하고 있습니다...',
    '광고 패널티와 최신성 보너스를 반영하고 있습니다...',
    '최종 신뢰도 점수를 산출하고 있습니다...',
  ],
  saving: [
    '분석 결과를 저장하고 있습니다...',
    '신뢰도 순위를 정렬하고 있습니다...',
  ],
};

// ─── Thinking 카드 ────────────────────────────────────

function ThinkingCard({ stage, isActive }: { stage: string; isActive: boolean }) {
  const [messageIdx, setMessageIdx] = useState(0);
  const messages = THINKING_MESSAGES[stage] ?? ['처리 중...'];

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setMessageIdx(prev => (prev + 1) % messages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isActive, messages.length]);

  const STAGE_LABELS: Record<string, string> = {
    collecting: '데이터 수집',
    normalizing: '장소 정규화',
    analyzing: '광고 분석',
    scoring: '점수 계산',
    saving: '결과 저장',
  };

  return (
    <div className={`bg-white border rounded p-4 transition-all duration-500 ${
      isActive ? 'border-primary shadow-sm' : 'border-neutral-border opacity-60'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        {isActive ? (
          <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <div className="h-4 w-4 shrink-0 rounded-full bg-neutral-border" />
        )}
        <span className={`text-xs font-semibold tracking-tight ${isActive ? 'text-primary' : 'text-neutral-light'}`}>
          {STAGE_LABELS[stage] ?? stage}
        </span>
      </div>

      {isActive && (
        <div className="space-y-2">
          {messages.map((msg, i) => {
            const isCurrent = i === messageIdx;
            const isPast = i < messageIdx;
            return (
              <div key={i} className={`flex items-start gap-2 transition-opacity duration-700 ${
                isCurrent ? 'animate-thinking' : isPast ? 'opacity-100' : 'opacity-20'
              }`}>
                <span className={`mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full ${
                  isPast ? 'bg-score-high' : isCurrent ? 'bg-primary' : 'bg-neutral-border'
                }`} />
                <span className={`text-[11px] leading-relaxed ${
                  isCurrent ? 'text-neutral-dark font-medium' : isPast ? 'text-neutral-mid' : 'text-neutral-light'
                }`}>
                  {msg}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 완료 카드 ────────────────────────────────────────

function CompletedStageCard({ stage, result }: { stage: string; result: Record<string, unknown> | null }) {
  const detail = result ? formatStageDetail({ stage, status: 'completed', result, error: null }) : null;

  return (
    <div className="bg-white border border-neutral-border rounded p-3 flex items-center gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-score-high-bg">
        <svg className="h-2.5 w-2.5 text-score-high" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-neutral-dark">
          {{collecting:'데이터 수집',normalizing:'장소 정규화',analyzing:'광고 분석',scoring:'점수 계산',saving:'결과 저장'}[stage] ?? stage}
        </span>
        {detail && <span className="ml-2 text-[10px] text-neutral-light">{detail}</span>}
      </div>
    </div>
  );
}

// ─── 체감 진행률 (시각적 균등화) ──────────────────────

function useSmoothedProgress(actualPercent: number, currentStage: string): number {
  const [display, setDisplay] = useState(0);
  const targetRef = useRef(0);

  useEffect(() => {
    // 실제 단계 기반 최소 진행률 — 수집 단계가 오래 걸려도 30%까지는 빠르게 진행되도록
    const stageMinPercent: Record<string, number> = {
      collecting: 10,
      normalizing: 40,
      analyzing: 55,
      scoring: 75,
      saving: 90,
      completed: 100,
    };

    const stageMin = stageMinPercent[currentStage] ?? 0;
    // 실제 진행률과 단계 최소값 중 큰 값 사용
    targetRef.current = Math.max(actualPercent, stageMin);
  }, [actualPercent, currentStage]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplay(prev => {
        const target = targetRef.current;
        if (prev >= target) return prev;
        // 부드럽게 증가 (큰 차이일수록 빠르게)
        const step = Math.max(0.5, (target - prev) * 0.15);
        return Math.min(target, prev + step);
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return Math.round(display);
}

// ─── 메인 페이지 ──────────────────────────────────────

const POLL_INTERVAL = 2000;
const STAGE_ORDER = ['collecting', 'normalizing', 'analyzing', 'scoring', 'saving'];
const STAGE_MAP: Record<string, string> = {
  collecting: '후보 수집',
  normalizing: '장소 정규화',
  analyzing: '광고 분석',
  scoring: '리뷰 교차 검증',
  saving: '신뢰도 점수 계산',
};

export default function ResearchPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const router = useRouter();
  const { sessionId } = params;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');
  const completedStagesRef = useRef<StageData[]>([]);
  const [completedStages, setCompletedStages] = useState<StageData[]>([]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/status/${sessionId}`);
      if (!res.ok) {
        if (res.status === 404) setError('세션을 찾을 수 없습니다.');
        return null;
      }
      const data: StatusResponse = await res.json();
      setStatus(data);

      // 완료된 단계 추적
      for (const stage of data.stages) {
        if (stage.status === 'completed' && !completedStagesRef.current.some(s => s.stage === stage.stage)) {
          completedStagesRef.current = [...completedStagesRef.current, stage];
          setCompletedStages([...completedStagesRef.current]);
        }
      }

      return data;
    } catch {
      return null;
    }
  }, [sessionId]);

  // 파이프라인 실행 트리거 (run 엔드포인트 호출)
  const pipelineTriggered = useRef(false);
  useEffect(() => {
    if (pipelineTriggered.current) return;
    pipelineTriggered.current = true;

    fetch(`/api/pipeline/run/${sessionId}`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        console.log('[research] 파이프라인 완료:', data);
      })
      .catch(err => {
        console.error('[research] 파이프라인 실행 실패:', err);
      });
  }, [sessionId]);

  // 상태 폴링 (Supabase에서 진행 상태 읽기)
  useEffect(() => {
    let active = true;
    let pollCount = 0;

    async function doPoll() {
      if (!active) return;
      const data = await poll();
      pollCount++;

      if (data?.status === 'completed') {
        setTimeout(() => router.push(`/results/${sessionId}`), 2000);
        return;
      }
      if (data?.status === 'failed') return;

      const nextInterval = pollCount < 10 ? POLL_INTERVAL : 5000;
      setTimeout(doPoll, nextInterval);
    }

    // 약간 딜레이 후 폴링 시작 (run이 먼저 Supabase에 기록하도록)
    setTimeout(doPoll, 1000);
    return () => { active = false; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const actualPercent = status
    ? Math.round((status.progress.current / status.progress.total) * 100)
    : 0;
  const currentStage = status?.current_stage ?? 'collecting';
  const smoothedPercent = useSmoothedProgress(actualPercent, currentStage);

  const steps = status
    ? status.stages.map(s => ({
        label: STAGE_MAP[s.stage] ?? s.stage,
        status: s.status as 'completed' | 'in_progress' | 'pending' | 'failed',
        detail: s.status === 'completed' && s.result ? formatStageDetail(s) : s.error ?? undefined,
      }))
    : Object.keys(STAGE_MAP).map(key => ({
        label: STAGE_MAP[key],
        status: 'pending' as const,
      }));

  const activeStageIdx = currentStage === 'completed' || currentStage === 'failed'
    ? STAGE_ORDER.length
    : STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header showSearch={false} />

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 파이프라인 스텝 */}
        <div className="hidden w-[280px] shrink-0 border-r border-neutral-border p-5 lg:block overflow-y-auto">
          <div className="mb-5">
            <p className="text-sm font-semibold text-neutral-dark tracking-tight">
              {status?.progress.message ?? '리서치 준비 중...'}
            </p>
            <p className="mt-1 text-xs text-neutral-light">보통 30초~2분 소요</p>
          </div>

          <ProgressTracker steps={steps} />

          {status?.status === 'completed' && (
            <div className="mt-4 rounded bg-score-high-bg p-3 text-xs text-score-high-text font-medium">
              리서치 완료! 결과 페이지로 이동합니다...
            </div>
          )}

          {status?.status === 'failed' && (
            <div className="mt-4">
              <div className="rounded bg-score-low-bg p-3 text-xs text-score-low">
                파이프라인 실행 중 오류가 발생했습니다.
              </div>
              <Link href="/" className="mt-3 block text-center bg-primary text-white font-medium rounded px-6 py-2.5 text-sm">
                다시 시도
              </Link>
            </div>
          )}
        </div>

        {/* 우측: 메인 영역 — thinking 카드 */}
        <div className="flex flex-1 flex-col p-4 sm:p-6">
          {/* 모바일 진행 상태 */}
          <div className="mb-4 lg:hidden">
            <p className="text-sm font-semibold text-neutral-dark tracking-tight">
              {status?.progress.message ?? '리서치 준비 중...'}
            </p>
            <p className="mt-1 text-xs text-neutral-light">보통 30초~2분 소요</p>
          </div>

          {/* thinking 카드 영역 */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[480px] space-y-3">
              {STAGE_ORDER.map(stage => {
                const stageData = completedStages.find(s => s.stage === stage);
                const isActive = stage === currentStage && status?.status !== 'completed' && status?.status !== 'failed';
                const isPending = STAGE_ORDER.indexOf(stage) > activeStageIdx;
                const isCompleted = !!stageData;

                if (isCompleted && !isActive) {
                  return <CompletedStageCard key={stage} stage={stage} result={stageData.result} />;
                }
                if (isActive) {
                  return <ThinkingCard key={stage} stage={stage} isActive={true} />;
                }
                if (isPending && status?.status !== 'completed') {
                  return <ThinkingCard key={stage} stage={stage} isActive={false} />;
                }
                if (status?.status === 'completed' && isCompleted) {
                  return <CompletedStageCard key={stage} stage={stage} result={stageData.result} />;
                }
                return null;
              })}

              {/* 완료 메시지 */}
              {status?.status === 'completed' && (
                <div className="flex items-center gap-3 bg-score-high-bg rounded p-4">
                  <svg className="h-5 w-5 shrink-0 text-score-high" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-score-high-text">분석 완료</p>
                    <p className="text-[10px] text-score-high-text mt-0.5">결과 페이지로 이동합니다...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 하단 진행률 바 (체감 균등화) */}
          <div className="mt-auto pt-4 border-t border-neutral-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-neutral-mid">전체 진행률</span>
              <span className="text-xs font-medium text-neutral-dark">{smoothedPercent}%</span>
            </div>
            <div className="h-1 bg-neutral-border rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm bg-primary transition-all duration-300 ease-out"
                style={{ width: `${smoothedPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed bottom-16 left-4 right-4 sm:bottom-4 rounded bg-score-low-bg p-3 text-xs text-score-low text-center">
          {error}
        </div>
      )}

      <MobileNav />
    </div>
  );
}

// ─── 유틸 ──────────────────────────────────────────────

function formatStageDetail(stage: StageData): string | undefined {
  const r = stage.result;
  if (!r) return undefined;

  switch (stage.stage) {
    case 'collecting': {
      const d = r as { total?: number; naver?: number; google?: number; kakao?: number };
      return `${d.total}개 장소, 블로그 ${d.naver ?? 0}건`;
    }
    case 'normalizing': {
      const d = r as { merged?: number; after?: number };
      return `${d.merged ?? 0}개 병합 → ${d.after ?? 0}개`;
    }
    case 'analyzing': {
      const d = r as { total_blog_posts?: number; total_ads_detected?: number };
      return `블로그 ${d.total_blog_posts ?? 0}건, 광고 ${d.total_ads_detected ?? 0}건`;
    }
    case 'scoring': {
      const d = r as { total_scored?: number; avg_trust_score?: number };
      return `${d.total_scored ?? 0}개, 평균 ${d.avg_trust_score ?? 0}점`;
    }
    case 'saving': return '완료';
    default: return undefined;
  }
}
