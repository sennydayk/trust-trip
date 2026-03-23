'use client';

import { useState } from 'react';
import { getTrustColor } from '@/lib/utils/trust-color';
import TrustBadge from '@/components/score/TrustBadge';
import Tooltip from '@/components/ui/Tooltip';

interface PlaceCardProps {
  rank: number;
  name: string;
  address?: string;
  category?: string;
  trustScore: number;
  googleRating?: number;
  blogCount?: number;
  adPercent?: number;
  sources?: string[];
  mentionCount?: number;
  children?: React.ReactNode;
}

export default function PlaceCard({
  rank,
  name,
  address,
  category,
  trustScore,
  googleRating,
  blogCount,
  adPercent,
  sources,
  mentionCount,
  children,
}: PlaceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = getTrustColor(trustScore);

  return (
    <div className={`bg-white border border-neutral-border rounded p-3.5 ${expanded ? 'sm:col-span-2' : ''}`}>
      {/* 접힌 상태 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 text-left"
      >
        {/* 순위 뱃지 */}
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white ${
            rank <= 3 ? 'bg-score-high' : 'bg-score-mid'
          }`}
        >
          {rank}
        </span>

        {/* 장소 정보 */}
        <div className="min-w-0 flex-1">
          <Tooltip content={name}>
            <p className="truncate text-sm font-semibold tracking-tight text-neutral-dark">
              {name}
            </p>
          </Tooltip>
          <Tooltip content={[address, category].filter(Boolean).join(' · ')}>
            <p className="mt-0.5 truncate text-[11px] font-normal text-neutral-mid">
              {[address, category].filter(Boolean).join(' · ')}
            </p>
          </Tooltip>
        </div>

        {/* 태그 */}
        <div className="hidden items-center gap-1.5 sm:flex">
          {googleRating != null && (
            <span className="bg-primary-light text-primary text-[10px] font-medium rounded-sm px-1.5 py-0.5">
              G {googleRating.toFixed(1)}
            </span>
          )}
          {blogCount != null && (
            <span className="bg-primary-light text-primary text-[10px] font-medium rounded-sm px-1.5 py-0.5">
              블로그 {blogCount}건
            </span>
          )}
          {adPercent != null && adPercent > 0 && (
            <span className="bg-score-low-bg text-score-low text-[10px] font-medium rounded-sm px-1.5 py-0.5">
              광고 {adPercent}%
            </span>
          )}
        </div>

        {/* 점수 */}
        <TrustBadge score={trustScore} size="md" />

        {/* 화살표 */}
        <svg
          className={`h-4 w-4 shrink-0 text-neutral-light transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* 소스 + 추천 */}
      {sources && (
        <div className="mt-2 flex items-center gap-1.5">
          {sources.map(s => (
            <span key={s} className="border border-neutral-border text-neutral-mid text-[10px] rounded-sm px-1.5 py-0.5">
              {s}
            </span>
          ))}
          {mentionCount != null && (
            <span className="text-[10px] text-neutral-light">
              추천 {mentionCount}회
            </span>
          )}
        </div>
      )}

      {/* 프로그레스 바 */}
      <div className="mt-2.5 h-[3px] bg-neutral-border rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm transition-all ${colors.badge}`}
          style={{ width: `${Math.min(trustScore, 100)}%` }}
        />
      </div>

      {/* 펼친 상태 */}
      {expanded && children && (
        <div className="mt-3 border-t border-neutral-border pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
