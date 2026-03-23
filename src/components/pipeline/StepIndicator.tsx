type StepStatus = 'completed' | 'in_progress' | 'pending' | 'failed';

interface StepIndicatorProps {
  status: StepStatus;
}

export default function StepIndicator({ status }: StepIndicatorProps) {
  if (status === 'completed') {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-score-high-bg">
        <svg className="h-3 w-3 text-score-high" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
    );
  }

  if (status === 'in_progress') {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-light">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-score-low-bg">
        <svg className="h-3 w-3 text-score-low" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }

  // pending
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-surface">
      <div className="h-2 w-2 rounded-full bg-neutral-border" />
    </div>
  );
}
