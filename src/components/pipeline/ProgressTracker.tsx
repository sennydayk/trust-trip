import StepIndicator from './StepIndicator';

type StepStatus = 'completed' | 'in_progress' | 'pending' | 'failed';

interface PipelineStep {
  label: string;
  status: StepStatus;
  detail?: string;
  progress?: { current: number; total: number };
}

interface ProgressTrackerProps {
  steps: PipelineStep[];
}

const STEP_LABELS = ['후보 수집', '장소 정규화', '광고 분석', '리뷰 교차 검증', '신뢰도 점수 계산'];

export default function ProgressTracker({ steps }: ProgressTrackerProps) {
  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;

        return (
          <div key={i} className="flex gap-3">
            {/* 아이콘 + 세로선 */}
            <div className="flex flex-col items-center">
              <StepIndicator status={step.status} />
              {!isLast && (
                <div
                  className={`w-px flex-1 min-h-[24px] ${
                    step.status === 'completed' ? 'bg-score-high' : 'bg-neutral-border'
                  }`}
                />
              )}
            </div>

            {/* 내용 */}
            <div className="pb-5">
              <p
                className={`text-xs font-medium ${
                  step.status === 'in_progress'
                    ? 'text-primary'
                    : step.status === 'completed'
                    ? 'text-neutral-dark'
                    : step.status === 'failed'
                    ? 'text-score-low'
                    : 'text-neutral-light'
                }`}
              >
                {step.label}
              </p>

              {step.detail && (
                <p className="mt-0.5 text-[11px] text-neutral-mid">{step.detail}</p>
              )}

              {step.status === 'in_progress' && step.progress && (
                <div className="mt-1.5 w-40">
                  <div className="h-[3px] bg-neutral-border rounded-sm overflow-hidden">
                    <div
                      className="h-full rounded-sm bg-primary transition-all"
                      style={{
                        width: `${Math.round((step.progress.current / step.progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-neutral-light">
                    {step.progress.current}/{step.progress.total}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
