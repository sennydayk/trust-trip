'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export type LayoutVariant = 'card' | 'dashboard';

const STORAGE_KEY = 'trusttrip_layout';
const DEFAULT_LAYOUT: LayoutVariant = 'dashboard';

/**
 * A/B 레이아웃 관리 훅.
 *
 * 우선순위: URL ?layout= > localStorage > 기본값(dashboard)
 * 변경 시 localStorage에 저장.
 */
export function useLayout(): [LayoutVariant, (v: LayoutVariant) => void] {
  const searchParams = useSearchParams();

  const [variant, setVariantState] = useState<LayoutVariant>(() => {
    // SSR에서는 기본값 사용
    if (typeof window === 'undefined') return DEFAULT_LAYOUT;

    const urlParam = searchParams?.get('layout');
    if (urlParam === 'card' || urlParam === 'dashboard') return urlParam;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'card' || stored === 'dashboard') return stored as LayoutVariant;

    return DEFAULT_LAYOUT;
  });

  // URL 파라미터 변경 감지
  useEffect(() => {
    const urlParam = searchParams?.get('layout');
    if (urlParam === 'card' || urlParam === 'dashboard') {
      setVariantState(urlParam);
      localStorage.setItem(STORAGE_KEY, urlParam);
    }
  }, [searchParams]);

  function setVariant(v: LayoutVariant) {
    setVariantState(v);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, v);
    }
  }

  return [variant, setVariant];
}
