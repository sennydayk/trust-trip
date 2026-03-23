'use client';

import type { LayoutVariant } from '@/lib/utils/use-layout';

interface LayoutSwitcherProps {
  variant: LayoutVariant;
  onChange: (v: LayoutVariant) => void;
}

export default function LayoutSwitcher({ variant, onChange }: LayoutSwitcherProps) {
  return (
    <div className="flex">
      <button
        type="button"
        onClick={() => onChange('card')}
        title="카드형 (버전 A)"
        className={`flex items-center gap-1 text-[10px] rounded-l px-2 py-1 font-medium border ${
          variant === 'card'
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-neutral-mid border-neutral-border'
        }`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
        </svg>
        A
      </button>
      <button
        type="button"
        onClick={() => onChange('dashboard')}
        title="대시보드형 (버전 B)"
        className={`flex items-center gap-1 text-[10px] rounded-r px-2 py-1 font-medium border border-l-0 ${
          variant === 'dashboard'
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-neutral-mid border-neutral-border'
        }`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
        </svg>
        B
      </button>
    </div>
  );
}
