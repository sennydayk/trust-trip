// 장소 정규화 — 스펙 섹션 7
// 좌표 반경 50m + 이름 편집 거리 유사도로 동일 장소 병합
// match_score = 0.6 × 좌표근접도 + 0.4 × 이름유사도, 0.7 이상이면 병합

import { getDistance } from 'geolib';
import { compareTwoStrings } from 'string-similarity';

// ─── 타입 정의 ─────────────────────────────────────────

export interface RawPlace {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  category?: string;
  source: 'google' | 'naver' | 'kakao';
  google_place_id?: string;
}

export interface NormalizedPlace {
  name: string;
  normalized_name: string;
  latitude: number;
  longitude: number;
  address?: string;
  category?: string;
  mention_count: number;
  google_place_id?: string;
  sources: string[];
}

interface MatchCandidate {
  index: number;
  matchScore: number;
  coordinateProximity: number;
  nameSimilarity: number;
  distance: number;
}

// ─── 텍스트 정규화 ────────────────────────────────────

// 영문 → 한글 변환 맵 (자주 쓰이는 카테고리)
const EN_KO_MAP: Record<string, string> = {
  cafe: '카페',
  coffee: '커피',
  restaurant: '레스토랑',
  ramen: '라멘',
  sushi: '스시',
  bar: '바',
  hotel: '호텔',
  hostel: '호스텔',
  park: '공원',
  station: '역',
  market: '시장',
  temple: '사원',
  shrine: '신사',
  bakery: '베이커리',
  pub: '펍',
};

/**
 * 이름 텍스트 정규화
 * - 공백 제거, 소문자 변환, 특수문자 제거
 * - 영문 카테고리 키워드를 한글로 매핑
 */
export function normalizeText(name: string): string {
  let text = name.toLowerCase();

  // 영문 → 한글 변환
  for (const [en, ko] of Object.entries(EN_KO_MAP)) {
    text = text.replace(new RegExp(en, 'gi'), ko);
  }

  return text
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣ぁ-んァ-ヶ一-龥a-z0-9]/g, '');
}

// ─── 단일 장소 매칭 (스펙 섹션 7 normalizePlace) ───────

/**
 * 새 장소를 기존 장소 목록과 비교해 매칭 후보를 찾는다.
 * 스펙의 normalizePlace(newPlace, existingPlaces) 시그니처 그대로 구현.
 *
 * @returns 매칭된 기존 장소 인덱스 + 점수, 또는 null (새 장소)
 */
export function normalizePlace(
  newPlace: RawPlace,
  existingPlaces: NormalizedPlace[],
): MatchCandidate | null {
  const candidates: MatchCandidate[] = [];

  for (let i = 0; i < existingPlaces.length; i++) {
    const existing = existingPlaces[i];

    // 1단계: 좌표 필터 (반경 50m)
    const distance = getDistance(
      { latitude: newPlace.latitude, longitude: newPlace.longitude },
      { latitude: existing.latitude, longitude: existing.longitude },
    );
    if (distance > 50) continue;

    // 2단계: 이름 유사도 (string-similarity의 Dice coefficient)
    const newNorm = normalizeText(newPlace.name);
    const existNorm = normalizeText(existing.name);
    const nameSimilarity = compareTwoStrings(newNorm, existNorm);

    // 3단계: 복합 점수
    const coordinateProximity = 1 - distance / 50;
    const matchScore = 0.6 * coordinateProximity + 0.4 * nameSimilarity;

    if (matchScore >= 0.7) {
      candidates.push({
        index: i,
        matchScore,
        coordinateProximity,
        nameSimilarity,
        distance,
      });
    }
  }

  if (candidates.length === 0) return null;

  // 최고 점수 후보 반환
  candidates.sort((a, b) => b.matchScore - a.matchScore);
  return candidates[0];
}

// ─── 병합 로직 ─────────────────────────────────────────

/**
 * 매칭된 기존 장소에 새 장소 정보를 병합한다.
 * - mention_count 증가
 * - 소스 추가
 * - google_place_id 보완
 * - 더 상세한 주소/카테고리 채택
 */
function mergePlaces(
  existing: NormalizedPlace,
  newPlace: RawPlace,
): NormalizedPlace {
  existing.mention_count += 1;

  if (!existing.sources.includes(newPlace.source)) {
    existing.sources.push(newPlace.source);
  }

  // google_place_id는 가장 먼저 얻은 것 유지
  if (newPlace.google_place_id && !existing.google_place_id) {
    existing.google_place_id = newPlace.google_place_id;
  }

  // 더 긴(상세한) 주소로 업데이트
  if (newPlace.address && (!existing.address || newPlace.address.length > existing.address.length)) {
    existing.address = newPlace.address;
  }

  // 카테고리가 없으면 채움
  if (newPlace.category && !existing.category) {
    existing.category = newPlace.category;
  }

  return existing;
}

// ─── 배치 정규화 (파이프라인용) ────────────────────────

/**
 * 여러 RawPlace를 순차적으로 정규화하여 병합된 NormalizedPlace 배열을 반환.
 * 파이프라인 normalize.ts에서 호출하는 메인 함수.
 */
export function normalizePlaces(rawPlaces: RawPlace[]): NormalizedPlace[] {
  const merged: NormalizedPlace[] = [];

  for (const raw of rawPlaces) {
    const match = normalizePlace(raw, merged);

    if (match) {
      mergePlaces(merged[match.index], raw);
    } else {
      merged.push({
        name: raw.name,
        normalized_name: normalizeText(raw.name),
        latitude: raw.latitude,
        longitude: raw.longitude,
        address: raw.address,
        category: raw.category,
        mention_count: 1,
        google_place_id: raw.google_place_id,
        sources: [raw.source],
      });
    }
  }

  return merged;
}
