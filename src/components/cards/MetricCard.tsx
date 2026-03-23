interface MetricCardProps {
  label: string;
  value: number | string;
  color?: 'default' | 'red' | 'green';
}

export default function MetricCard({ label, value, color = 'default' }: MetricCardProps) {
  const valueColor =
    color === 'red'
      ? 'text-score-low'
      : color === 'green'
      ? 'text-score-high'
      : 'text-neutral-dark';

  return (
    <div className="bg-neutral-surface rounded p-3">
      <p className="text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}
