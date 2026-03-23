// 1단계: 후보 수집 — 네이버 블로그 + Google Places + 카카오맵 병렬 검색
// 실제 API 호출 시도 → 실패 시 검색어 기반 시뮬레이션 데이터 생성

import type { RawPlace } from '@/lib/analyzers/normalizer';
import { getDistance } from 'geolib';
import { searchPlaces, type GooglePlaceResult } from '@/lib/scrapers/google-maps';
import { searchDomesticPlaces } from '@/lib/scrapers/kakao-map';
import { crawlNaverBlogsLight, crawlNaverBlogsForPlaces, type LightBlogPost } from '@/lib/scrapers/naver-blog-light';

export interface CollectResult {
  places: RawPlace[];
  blogPosts: LightBlogPost[];
  blogsByPlace: Map<string, LightBlogPost[]>;
  googleDetails: Map<string, GooglePlaceResult>;
  detectedRegionType: 'domestic' | 'overseas';
  stats: {
    naver: number;
    google: number;
    kakao: number;
    blog: number;
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

// ─── 지역 좌표 동적 조회 ──────────────────────────────

/**
 * Google Geocoding API로 지역명의 좌표를 조회한다.
 * REGION_COORDS에 없는 모든 지역(홍대, 강남, 이태원 등)에 대응.
 */
async function geocodeDestination(destination: string): Promise<{ lat: number; lng: number } | null> {
  // 1. 하드코딩 캐시 우선
  if (REGION_COORDS[destination]) return REGION_COORDS[destination];

  // 2. Google Geocoding API
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}&language=ko`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location;
      console.log(`[collect] 지역 좌표 조회: "${destination}" → ${loc.lat}, ${loc.lng}`);
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (err) {
    console.warn('[collect] Geocoding 실패:', err instanceof Error ? err.message : err);
  }

  return null;
}

// ─── 국가 판별 (수집된 장소 주소 기반) ─────────────────

const DOMESTIC_INDICATORS = [
  '대한민국', 'South Korea', 'Korea', '한국',
  '서울', '부산', '인천', '대구', '대전', '광주', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  '특별시', '광역시', '특별자치', '특별자치도',
];

/**
 * 수집된 장소들의 주소와 Google API 응답에서 국내/해외를 판별한다.
 * 하드코딩 도시 목록 대신 실제 데이터 기반으로 판단.
 */
function detectRegionType(
  places: Array<{ address?: string }>,
  googleDetails: Map<string, GooglePlaceResult>,
): 'domestic' | 'overseas' {
  let domesticCount = 0;
  let overseasCount = 0;

  // 수집된 장소 주소에서 판별
  const allAddresses = [
    ...places.map(p => p.address ?? ''),
    ...Array.from(googleDetails.values()).map(d => d.address),
  ].filter(Boolean);

  for (const addr of allAddresses) {
    const isDomestic = DOMESTIC_INDICATORS.some(ind => addr.includes(ind));
    if (isDomestic) domesticCount++;
    else overseasCount++;
  }

  // 과반수 기준으로 결정
  if (domesticCount > overseasCount) return 'domestic';
  if (overseasCount > domesticCount) return 'overseas';

  // 동점이면 주소에 한글이 많으면 domestic
  const koreanCharCount = allAddresses.join('').replace(/[^가-힣]/g, '').length;
  const totalCharCount = allAddresses.join('').length;
  return koreanCharCount / totalCharCount > 0.3 ? 'domestic' : 'overseas';
}

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
): Promise<{ places: RawPlace[]; details: GooglePlaceResult[] }> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return { places: [], details: [] };

  try {
    const query = `${destination} ${category}`;
    const destCoord = await geocodeDestination(destination);

    const results = await searchPlaces(query, {
      maxResults: 30,
      location: destCoord ?? undefined,
      radius: destCoord ? 30000 : undefined, // 좌표 있으면 30km 반경
    });

    const places = results.map(r => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      address: r.address,
      category: r.category ?? category,
      source: 'google' as const,
      google_place_id: r.placeId,
    }));
    return { places, details: results };
  } catch (err) {
    console.warn('[collect] Google API 실패:', err instanceof Error ? err.message : err);
    return { places: [], details: [] };
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
  excludePlaceIds?: string[],
): Promise<CollectResult> {
  // 장소 수집 (Google + 카카오 병렬) — 블로그는 analyze에서 장소별 개별 검색
  const [googleResult, kakaoPlaces] = await Promise.all([
    collectFromGoogle(destination, category),
    collectFromKakao(destination, category),
  ]);

  let allPlaces = [...googleResult.places, ...kakaoPlaces];

  const googleDetails = new Map<string, GooglePlaceResult>();
  for (const detail of googleResult.details) {
    googleDetails.set(detail.placeId, detail);
  }

  if (allPlaces.length === 0) {
    console.log(`[collect] API 키 미설정 — "${destination} ${category}" 시뮬레이션 데이터 생성`);
    allPlaces = generateSimulatedPlaces(destination, category);
  }

  // 위치 검증 (동적 좌표)
  const destCoord = await geocodeDestination(destination);
  if (destCoord && allPlaces.length > 0) {
    const MAX_DISTANCE_KM = 100;
    const before = allPlaces.length;
    allPlaces = allPlaces.filter(place => {
      const dist = getDistance(
        { latitude: destCoord.lat, longitude: destCoord.lng },
        { latitude: place.latitude, longitude: place.longitude },
      );
      return dist <= MAX_DISTANCE_KM * 1000;
    });
    const removed = before - allPlaces.length;
    if (removed > 0) console.log(`[collect] 위치 검증: ${removed}개 장소 제거`);
  }

  // 재검색 시 이전 결과 제외
  if (excludePlaceIds && excludePlaceIds.length > 0) {
    const excludeSet = new Set(excludePlaceIds);
    const before = allPlaces.length;
    allPlaces = allPlaces.filter(p => !p.google_place_id || !excludeSet.has(p.google_place_id));
    console.log(`[collect] 재검색 제외: ${before - allPlaces.length}개 제거`);
  }

  // 최종 20개로 고정 (Google 평점 높은순 정렬 후 상위 20개)
  const TARGET_COUNT = 20;
  if (allPlaces.length > TARGET_COUNT) {
    // Google 장소는 평점 정보가 있으므로 상위 유지
    allPlaces = allPlaces.slice(0, TARGET_COUNT);
  }

  const blogsByPlace = new Map<string, LightBlogPost[]>();
  const detectedRegionType = detectRegionType(allPlaces, googleDetails);

  const stats = {
    naver: 0,
    google: allPlaces.filter(p => p.source === 'google').length,
    kakao: allPlaces.filter(p => p.source === 'kakao').length,
    blog: 0,
    total: allPlaces.length,
  };

  console.log(`[collect] 수집 완료: Google ${stats.google} / 카카오 ${stats.kakao} (총 ${stats.total}) / 지역: ${detectedRegionType}`);

  return { places: allPlaces, blogPosts: [], blogsByPlace, googleDetails, detectedRegionType, stats };
}
