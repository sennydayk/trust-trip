// 2단계: 장소 정규화 — 좌표 + 이름 유사도 기반 중복 병합

import { normalizePlaces, type RawPlace, type NormalizedPlace } from '@/lib/analyzers/normalizer';

export interface NormalizeResult {
  places: NormalizedPlace[];
  stats: {
    before: number;
    after: number;
    merged: number;
  };
}

export async function normalizeCandidates(
  rawPlaces: RawPlace[],
): Promise<NormalizeResult> {
  const normalized = normalizePlaces(rawPlaces);

  return {
    places: normalized,
    stats: {
      before: rawPlaces.length,
      after: normalized.length,
      merged: rawPlaces.length - normalized.length,
    },
  };
}
