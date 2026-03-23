'use client';

import type { LayoutVariant } from '@/lib/utils/use-layout';
import Sidebar from './Sidebar';

interface LayoutWrapperProps {
  variant: LayoutVariant;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A/B 테스트용 레이아웃 래퍼.
 *
 * - 'dashboard': 좌측 Sidebar + 우측 메인 (사이드바 고정)
 * - 'card': 풀스크린 중앙 정렬 (max-w-[640px])
 */
export default function LayoutWrapper({
  variant,
  sidebar,
  children,
}: LayoutWrapperProps) {
  if (variant === 'card') {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-5 pb-20 sm:pb-5">
        {children}
      </main>
    );
  }

  // dashboard (기본)
  return (
    <div className="flex flex-1 overflow-hidden">
      {sidebar ?? (
        <div className="hidden lg:block">
          <Sidebar />
        </div>
      )}
      <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-5 sm:pb-5">
        {children}
      </main>
    </div>
  );
}
