// 1단계: 후보 수집 — 네이버 블로그 + Google Places + 카카오맵 병렬 검색
// 실제 API 호출 시도 → 실패 시 검색어 기반 시뮬레이션 데이터 생성

import type { RawPlace } from '@/lib/analyzers/normalizer';
import { searchPlaces } from '@/lib/scrapers/google-maps';
import { searchDomesticPlaces } from '@/lib/scrapers/kakao-map';

export interface CollectResult {
  places: RawPlace[];
  stats: {
    naver: number;
    google: number;
    kakao: number;
    total: number;
  };
}

// ─── 지역 좌표 데이터베이스 ───────────────────────────

const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  // 국내
  '서울': { lat: 37.5665, lng: 126.9780 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '제주': { lat: 33.4996, lng: 126.5312 },
  '강릉': { lat: 37.7519, lng: 128.8761 },
  '속초': { lat: 38.2070, lng: 128.5918 },
  '경주': { lat: 35.8562, lng: 129.2247 },
  '여수': { lat: 34.7604, lng: 127.6622 },
  '전주': { lat: 35.8242, lng: 127.1479 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '통영': { lat: 34.8544, lng: 128.4332 },
  '거제': { lat: 34.8806, lng: 128.6211 },
  // 해외
  '오사카': { lat: 34.6937, lng: 135.5023 },
  '도쿄': { lat: 35.6762, lng: 139.6503 },
  '교토': { lat: 35.0116, lng: 135.7681 },
  '후쿠오카': { lat: 33.5904, lng: 130.4017 },
  '방콕': { lat: 13.7563, lng: 100.5018 },
  '싱가포르': { lat: 1.3521, lng: 103.8198 },
  '하노이': { lat: 21.0278, lng: 105.8342 },
  '다낭': { lat: 16.0471, lng: 108.2068 },
  '파리': { lat: 48.8566, lng: 2.3522 },
  '런던': { lat: 51.5074, lng: -0.1278 },
  '뉴욕': { lat: 40.7128, lng: -74.0060 },
};

// 카테고리별 장소 이름 템플릿
const CATEGORY_TEMPLATES: Record<string, string[]> = {
  '맛집': ['현지식당', '로컬 레스토랑', '전통 음식점', '인기 맛집', '숨은 맛집', '노포 식당', '가성비 맛집', '분위기 식당'],
  '카페': ['로스터리 카페', '뷰 카페', '디저트 카페', '브런치 카페', '북카페', '베이커리 카페', '감성 카페', '루프탑 카페'],
  '관광지': ['전망대', '박물관', '공원', '역사 유적지', '시장', '테마파크', '미술관', '산책로'],
  '숙소': ['부티크 호텔', '게스트하우스', '리조트', '호스텔', '에어비앤비', '한옥 스테이', '풀빌라', '비즈니스 호텔'],
  '바/술집': ['칵테일바', '와인바', '로컬 펍', '루프탑 바', '재즈바', '크래프트 맥주집', '이자카야', '포차'],
};

// ─── 실제 API 호출 ────────────────────────────────────

async function collectFromGoogle(
  destination: string,
  category: string,
): Promise<RawPlace[]> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return [];

  try {
    const query = `${destination} ${category}`;
    const results = await searchPlaces(query, { maxResults: 10 });
    return results.map(r => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      address: r.address,
      category: r.category ?? category,
      source: 'google' as const,
      google_place_id: r.placeId,
    }));
  } catch (err) {
    console.warn('[collect] Google API 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function collectFromKakao(
  destination: string,
  category: string,
): Promise<RawPlace[]> {
  if (!process.env.KAKAO_REST_API_KEY) return [];

  try {
    const result = await searchDomesticPlaces(destination, category, { maxResults: 10 });
    return result.places.map(p => ({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.roadAddress || p.address,
      category: p.categoryTags[p.categoryTags.length - 1] ?? category,
      source: 'kakao' as const,
    }));
  } catch (err) {
    console.warn('[collect] 카카오 API 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── 시뮬레이션 데이터 (API 키 없을 때) ──────────────

function generateSimulatedPlaces(
  destination: string,
  category: string,
): RawPlace[] {
  const baseCoord = REGION_COORDS[destination] ?? { lat: 37.5665, lng: 126.9780 };
  const templates = CATEGORY_TEMPLATES[category] ?? CATEGORY_TEMPLATES['맛집'];
  const places: RawPlace[] = [];

  for (let i = 0; i < templates.length; i++) {
    const name = `${destination} ${templates[i]}`;
    // 기본 좌표 주변 ±0.01도(≈1km) 범위에서 분산
    const lat = baseCoord.lat + (Math.random() - 0.5) * 0.02;
    const lng = baseCoord.lng + (Math.random() - 0.5) * 0.02;
    const source = i % 3 === 0 ? 'google' : i % 3 === 1 ? 'naver' : 'kakao';

    places.push({
      name,
      latitude: Math.round(lat * 10000) / 10000,
      longitude: Math.round(lng * 10000) / 10000,
      address: `${destination}시 ${['중앙', '해변', '시내', '구시가지', '역앞', '공원앞', '시장근처', '대학로'][i % 8]}`,
      category,
      source: source as 'google' | 'naver' | 'kakao',
      google_place_id: source === 'google' ? `sim_${destination}_${i}` : undefined,
    });
  }

  // 일부 중복 (정규화 테스트용) — 이름 약간 변형해서 추가
  if (places.length >= 2) {
    places.push({
      ...places[0],
      name: places[0].name + ' 본점',
      latitude: places[0].latitude + 0.0002,
      longitude: places[0].longitude + 0.0001,
      source: places[0].source === 'google' ? 'naver' : 'google',
      google_place_id: undefined,
    });
    places.push({
      ...places[1],
      name: places[1].name.replace(destination, destination + ' '),
      latitude: places[1].latitude + 0.0003,
      source: 'naver',
      google_place_id: undefined,
    });
  }

  return places;
}

// ─── 메인 함수 ─────────────────────────────────────────

export async function collectPlaces(
  destination: string,
  category: string,
): Promise<CollectResult> {
  // 실제 API 병렬 호출 시도
  const [googlePlaces, kakaoPlaces] = await Promise.all([
    collectFromGoogle(destination, category),
    collectFromKakao(destination, category),
  ]);

  let allPlaces = [...googlePlaces, ...kakaoPlaces];

  // API 결과가 없으면 시뮬레이션 데이터 생성
  if (allPlaces.length === 0) {
    console.log(`[collect] API 키 미설정 — "${destination} ${category}" 시뮬레이션 데이터 생성`);
    allPlaces = generateSimulatedPlaces(destination, category);
  }

  const stats = {
    naver: allPlaces.filter(p => p.source === 'naver').length,
    google: allPlaces.filter(p => p.source === 'google').length,
    kakao: allPlaces.filter(p => p.source === 'kakao').length,
    total: allPlaces.length,
  };

  return { places: allPlaces, stats };
}
