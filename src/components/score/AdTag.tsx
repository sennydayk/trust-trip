type AdVariant = 'confirmed_ad' | 'suspected_ad' | 'organic';

interface AdTagProps {
  variant: AdVariant;
}

const VARIANT_STYLES: Record<AdVariant, { className: string; label: string }> = {
  confirmed_ad: {
    className: 'bg-score-low-bg text-score-low text-[10px] font-medium rounded-sm px-1.5 py-0.5',
    label: '광고',
  },
  suspected_ad: {
    className: 'bg-score-mid-bg text-score-mid-text text-[10px] font-medium rounded-sm px-1.5 py-0.5',
    label: '의심',
  },
  organic: {
    className: 'bg-score-high-bg text-score-high-text text-[10px] font-medium rounded-sm px-1.5 py-0.5',
    label: '진짜',
  },
};

export default function AdTag({ variant }: AdTagProps) {
  const style = VARIANT_STYLES[variant];

  return (
    <span className={style.className}>
      {style.label}
    </span>
  );
}
