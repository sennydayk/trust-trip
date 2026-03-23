import { getTrustColor } from '@/lib/utils/trust-color';

interface TrustBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'text-sm font-semibold tracking-tight h-6 w-8',
  md: 'text-base font-semibold tracking-tight h-7 w-10',
  lg: 'text-2xl font-semibold tracking-tight h-10 w-14',
};

export default function TrustBadge({ score, size = 'md' }: TrustBadgeProps) {
  const colors = getTrustColor(score);

  return (
    <span
      className={`inline-flex items-center justify-center rounded ${colors.bg} ${colors.text} ${SIZE_CLASSES[size]}`}
    >
      {Math.round(score)}
    </span>
  );
}
