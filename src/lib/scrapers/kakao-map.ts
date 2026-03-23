// 카카오맵 REST API 래퍼 — 키워드 검색, 장소 정보 (국내 전용)
// region_type === 'domestic'일 때만 호출

// ─── 타입 정의 ─────────────────────────────────────────

export interface KakaoPlaceResult {
  name: string;
  kakaoId: string;
  rating: number;
  reviewCount: number;
  categoryTags: string[];
  latitude: number;
  longitude: number;
  address: string;
  roadAddress: string;
  phone: string;
  placeUrl: string;
}

export interface KakaoSearchOptions {
  maxResults?: number;    // 기본 15
  page?: number;          // 기본 1
  sort?: 'accuracy' | 'distance';
  x?: string;             // 경도 (검색 중심 좌표)
  y?: string;             // 위도
}

export interface KakaoCrawlResult {
  places: KakaoPlaceResult[];
  stats: {
    totalFound: number;
    totalReturned: number;
  };
}

// ─── 내부 유틸 ─────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

function getApiKey(): string {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error('KAKAO_REST_API_KEY 환경 변수가 설정되지 않았습니다.');
  return key;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { headers });

      if (res.ok) return res;

      if (res.status === 429 && attempt < retries - 1) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[kakao-map] 429 rate limited, retrying in ${backoff}ms (${attempt + 1}/${retries})`);
        await delay(backoff);
        continue;
      }

      if (res.status >= 500 && attempt < retries - 1) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[kakao-map] ${res.status} server error, retrying in ${backoff}ms (${attempt + 1}/${retries})`);
        await delay(backoff);
        continue;
      }

      const body = await res.text();
      throw new Error(`Kakao API ${res.status}: ${body}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries - 1) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[kakao-map] Request failed, retrying in ${backoff}ms (${attempt + 1}/${retries}): ${lastError.message}`);
        await delay(backoff);
      }
    }
  }

  throw lastError ?? new Error('[kakao-map] 알 수 없는 에러');
}

// ─── 카카오 API 응답 타입 ──────────────────────────────

interface KakaoKeywordResponse {
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
  documents: Array<{
    id: string;
    place_name: string;
    category_name: string;       // "음식점 > 일식 > 초밥,롤"
    category_group_code: string; // "FD6" 등
    phone: string;
    address_name: string;
    road_address_name: string;
    x: string;                   // 경도
    y: string;                   // 위도
    place_url: string;
  }>;
}

// ─── 키워드 검색 ───────────────────────────────────────

export async function searchKakaoPlaces(
  query: string,
  options: KakaoSearchOptions = {},
): Promise<KakaoCrawlResult> {
  const apiKey = getApiKey();
  const maxResults = options.maxResults ?? 15;
  const sort = options.sort ?? 'accuracy';

  const allPlaces: KakaoPlaceResult[] = [];
  let totalFound = 0;
  const maxPages = Math.ceil(maxResults / 15);

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      query,
      page: String(page),
      size: String(Math.min(15, maxResults - allPlaces.length)),
      sort,
    });

    if (options.x) params.set('x', options.x);
    if (options.y) params.set('y', options.y);

    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`;
    const headers = { Authorization: `KakaoAK ${apiKey}` };

    const res = await fetchWithRetry(url, headers);
    const data: KakaoKeywordResponse = await res.json();

    if (page === 1) {
      totalFound = data.meta.total_count;
    }

    for (const doc of data.documents) {
      if (allPlaces.length >= maxResults) break;

      const categoryTags = doc.category_name
        .split('>')
        .map(s => s.trim())
        .filter(Boolean);

      allPlaces.push({
        name: doc.place_name,
        kakaoId: doc.id,
        rating: 0,          // 키워드 검색 API에는 평점 미포함, 별도 크롤링 필요
        reviewCount: 0,     // 키워드 검색 API에는 리뷰 수 미포함
        categoryTags,
        latitude: parseFloat(doc.y),
        longitude: parseFloat(doc.x),
        address: doc.address_name,
        roadAddress: doc.road_address_name,
        phone: doc.phone,
        placeUrl: doc.place_url,
      });
    }

    if (data.meta.is_end || allPlaces.length >= maxResults) break;
  }

  return {
    places: allPlaces,
    stats: {
      totalFound,
      totalReturned: allPlaces.length,
    },
  };
}

// ─── 장소 상세 (place_url 스크래핑) ────────────────────

// 카카오맵 API는 평점/리뷰 수를 제공하지 않으므로,
// 필요 시 place_url을 크롤링하여 보강합니다.
// Puppeteer 의존을 피하기 위해 cheerio + fetch로 처리합니다.

export async function enrichKakaoPlace(
  place: KakaoPlaceResult,
): Promise<KakaoPlaceResult> {
  try {
    // 카카오맵 place 페이지에서 평점/리뷰 수 추출 시도
    const res = await fetchWithRetry(place.placeUrl, {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const html = await res.text();

    // 평점 추출: "4.3" 형태
    const ratingMatch = html.match(/"score"\s*:\s*"?([\d.]+)"?/) ??
                         html.match(/점수\s*([\d.]+)/);
    if (ratingMatch) {
      place.rating = parseFloat(ratingMatch[1]);
    }

    // 리뷰 수 추출: "리뷰 123" 형태
    const reviewMatch = html.match(/"reviewCount"\s*:\s*(\d+)/) ??
                         html.match(/리뷰\s*(\d[\d,]*)/);
    if (reviewMatch) {
      place.reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
    }
  } catch (err) {
    console.warn(`[kakao-map] 장소 상세 보강 실패: ${place.name}`, err instanceof Error ? err.message : err);
  }

  return place;
}

// ─── 편의 함수: 국내 검색 + 상세 보강 ─────────────────

export async function searchDomesticPlaces(
  destination: string,
  category: string,
  options: KakaoSearchOptions = {},
): Promise<KakaoCrawlResult> {
  const query = `${destination} ${category}`;
  const result = await searchKakaoPlaces(query, options);

  // 각 장소에 평점/리뷰 수 보강 (순차, 카카오 rate limit 고려)
  for (let i = 0; i < result.places.length; i++) {
    result.places[i] = await enrichKakaoPlace(result.places[i]);
    if (i < result.places.length - 1) {
      await delay(300);
    }
  }

  return result;
}
