interface BreakdownItem {
  label: string;
  value: string;
  type: 'positive' | 'negative' | 'neutral' | 'disabled';
}

interface ScoreBreakdownProps {
  items: BreakdownItem[];
}

export default function ScoreBreakdown({ items }: ScoreBreakdownProps) {
  if (items.length === 0) return null;

  return (
    <div className="rounded border border-neutral-border bg-white p-3">
      <p className="text-[10px] font-semibold text-neutral-light uppercase tracking-[0.5px] mb-2.5">
        분석 요약
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-mid">{item.label}</span>
            <span
              className={`text-[11px] font-semibold ${
                item.type === 'positive'
                  ? 'text-score-high-text'
                  : item.type === 'negative'
                  ? 'text-score-low'
                  : item.type === 'disabled'
                  ? 'text-neutral-light'
                  : 'text-neutral-dark'
              }`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
