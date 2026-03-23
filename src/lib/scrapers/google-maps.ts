// Google Maps Places API 래퍼 — 텍스트 검색, 장소 상세, 리뷰 데이터 수집
// Text Search API → Place Details API (리뷰 포함)
// Rate limiting: 요청 간 200ms, 에러 시 최대 3회 재시도

// ─── 타입 정의 ─────────────────────────────────────────

export interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;   // "3 months ago" 등
  publishedAt: string;     // ISO 날짜 (추정치)
}

export interface GooglePlaceResult {
  name: string;
  placeId: string;
  rating: number;
  totalReviews: number;
  recentReviews3m: number;
  reviews: GoogleReview[];
  latitude: number;
  longitude: number;
  address: string;
  category: string | null;
}

export interface GoogleSearchOptions {
  maxResults?: number;     // 기본 20
  language?: string;       // 기본 'ko'
  location?: { lat: number; lng: number };  // 검색 중심 좌표
  radius?: number;         // 검색 반경 (미터)
}

// ─── 내부 유틸 ─────────────────────────────────────────

const RATE_LIMIT_MS = 200;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY 환경 변수가 설정되지 않았습니다.');
  return key;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.ok) return res;

      // 429 Too Many Requests → 백오프 후 재시도
      if (res.status === 429 && attempt < retries - 1) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[google-maps] 429 rate limited, retrying in ${backoff}ms (${attempt + 1}/${retries})`);
        await delay(backoff);
        continue;
      }

      // 5xx 서버 에러 → 재시도
      if (res.status >= 500 && attempt < retries - 1) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[google-maps] ${res.status} server error, retrying in ${backoff}ms (${attempt + 1}/${retries})`);
        await delay(backoff);
        continue;
      }

      const body = await res.text();
      throw new Error(`Google API ${res.status}: ${body}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries - 1) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[google-maps] Request failed, retrying in ${backoff}ms (${attempt + 1}/${retries}): ${lastError.message}`);
        await delay(backoff);
      }
    }
  }

  throw lastError ?? new Error('[google-maps] 알 수 없는 에러');
}

// "3 months ago", "a month ago" 등에서 대략적 날짜 추정
function estimateDateFromRelativeTime(relativeTime: string): string {
  const now = new Date();
  const lower = relativeTime.toLowerCase();

  const weekMatch = lower.match(/(\d+)\s*weeks?\s*ago/);
  const monthMatch = lower.match(/(\d+)\s*months?\s*ago/);
  const yearMatch = lower.match(/(\d+)\s*years?\s*ago/);
  const dayMatch = lower.match(/(\d+)\s*days?\s*ago/);

  if (dayMatch) {
    now.setDate(now.getDate() - parseInt(dayMatch[1]));
  } else if (weekMatch) {
    now.setDate(now.getDate() - parseInt(weekMatch[1]) * 7);
  } else if (monthMatch) {
    now.setMonth(now.getMonth() - parseInt(monthMatch[1]));
  } else if (yearMatch) {
    now.setFullYear(now.getFullYear() - parseInt(yearMatch[1]));
  } else if (lower.includes('a month ago')) {
    now.setMonth(now.getMonth() - 1);
  } else if (lower.includes('a week ago')) {
    now.setDate(now.getDate() - 7);
  } else if (lower.includes('a year ago')) {
    now.setFullYear(now.getFullYear() - 1);
  }

  return now.toISOString();
}

function isWithin3Months(isoDate: string): boolean {
  const date = new Date(isoDate);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  return date >= threeMonthsAgo;
}

// ─── Text Search API ───────────────────────────────────

interface TextSearchResponse {
  results: Array<{
    place_id: string;
    name: string;
    geometry: { location: { lat: number; lng: number } };
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
  }>;
  status: string;
  error_message?: string;
  next_page_token?: string;
}

export async function searchPlaces(
  query: string,
  options: GoogleSearchOptions = {},
): Promise<GooglePlaceResult[]> {
  const apiKey = getApiKey();
  const maxResults = options.maxResults ?? 20;
  const language = options.language ?? 'ko';

  const params = new URLSearchParams({
    query,
    key: apiKey,
    language,
  });

  // 위치 기반 검색 (해당 지역 장소 우선)
  if (options.location) {
    params.set('location', `${options.location.lat},${options.location.lng}`);
    params.set('radius', String(options.radius ?? 30000)); // 기본 30km
  }

  // 1페이지 + next_page_token으로 2페이지까지 수집
  const allCandidates: TextSearchResponse['results'] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < 2; page++) {
    const pageParams = new URLSearchParams(params);
    if (nextPageToken) {
      pageParams.set('pagetoken', nextPageToken);
    }

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${pageParams}`;
    const res = await fetchWithRetry(url);
    const data: TextSearchResponse = await res.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      if (page === 0) throw new Error(`Google Text Search failed: ${data.status} — ${data.error_message ?? ''}`);
      break;
    }

    if (data.status === 'ZERO_RESULTS') break;

    allCandidates.push(...data.results);
    nextPageToken = data.next_page_token;

    if (!nextPageToken || allCandidates.length >= maxResults) break;

    // next_page_token은 발급 후 잠시 대기해야 유효
    await delay(2000);
  }

  if (allCandidates.length === 0) return [];

  const candidates = allCandidates.slice(0, maxResults);
  const seen = new Set<string>();
  const results: GooglePlaceResult[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.place_id)) continue;
    seen.add(candidate.place_id);

    await delay(RATE_LIMIT_MS);

    try {
      const details = await getPlaceDetails(candidate.place_id, language);
      results.push(details);
    } catch (err) {
      // 개별 장소 실패 시 기본 정보로 폴백
      console.warn(`[google-maps] Details 실패, 기본 정보 사용: ${candidate.name}`, err);
      results.push({
        name: candidate.name,
        placeId: candidate.place_id,
        rating: candidate.rating ?? 0,
        totalReviews: candidate.user_ratings_total ?? 0,
        recentReviews3m: 0,
        reviews: [],
        latitude: candidate.geometry.location.lat,
        longitude: candidate.geometry.location.lng,
        address: candidate.formatted_address ?? '',
        category: candidate.types?.[0] ?? null,
      });
    }
  }

  return results;
}

// ─── Place Details API ─────────────────────────────────

interface PlaceDetailsResponse {
  result: {
    place_id: string;
    name: string;
    geometry: { location: { lat: number; lng: number } };
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    reviews?: Array<{
      author_name: string;
      rating: number;
      text: string;
      relative_time_description: string;
      time: number; // unix timestamp
    }>;
  };
  status: string;
  error_message?: string;
}

export async function getPlaceDetails(
  placeId: string,
  language = 'ko',
): Promise<GooglePlaceResult> {
  const apiKey = getApiKey();

  const fields = [
    'place_id', 'name', 'geometry', 'formatted_address',
    'rating', 'user_ratings_total', 'types', 'reviews',
  ].join(',');

  const params = new URLSearchParams({
    place_id: placeId,
    fields,
    key: apiKey,
    language,
    reviews_sort: 'newest',
  });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
  const res = await fetchWithRetry(url);
  const data: PlaceDetailsResponse = await res.json();

  if (data.status !== 'OK') {
    throw new Error(`Google Place Details failed: ${data.status} — ${data.error_message ?? ''}`);
  }

  const r = data.result;

  const reviews: GoogleReview[] = (r.reviews ?? []).map(rev => ({
    author: rev.author_name,
    rating: rev.rating,
    text: rev.text,
    relativeTime: rev.relative_time_description,
    publishedAt: rev.time
      ? new Date(rev.time * 1000).toISOString()
      : estimateDateFromRelativeTime(rev.relative_time_description),
  }));

  const recentReviews3m = reviews.filter(rev => isWithin3Months(rev.publishedAt)).length;

  return {
    name: r.name,
    placeId: r.place_id,
    rating: r.rating ?? 0,
    totalReviews: r.user_ratings_total ?? 0,
    recentReviews3m,
    reviews,
    latitude: r.geometry.location.lat,
    longitude: r.geometry.location.lng,
    address: r.formatted_address ?? '',
    category: r.types?.[0] ?? null,
  };
}
