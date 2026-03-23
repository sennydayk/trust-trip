interface SubScoreBarProps {
  source: string;
  score: number;    // 0.00 ~ 1.00
  weight: number;   // 0.00 ~ 1.00
  active?: boolean;
}

export default function SubScoreBar({
  source,
  score,
  weight,
  active = true,
}: SubScoreBarProps) {
  return (
    <div className={active ? '' : 'opacity-40'}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-dark">{source}</span>
        <span className="text-neutral-mid">
          {active ? score.toFixed(2) : 'N/A'}
          <span className="ml-1 text-neutral-light">
            (w {weight.toFixed(2)})
          </span>
        </span>
      </div>
      <div className="mt-1 h-[3px] bg-neutral-border rounded-sm overflow-hidden">
        {active && (
          <div
            className="h-full rounded-sm bg-primary transition-all"
            style={{ width: `${Math.round(score * 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}
