// 네이버 블로그 검색 — 네이버 검색 API 기반
// https://developers.naver.com/docs/serviceapi/search/blog/blog.md
// 일 25,000건 무료, JSON 응답, 안정적

import * as cheerio from 'cheerio';

export interface LightBlogPost {
  url: string;
  title: string;
  bloggerId: string;
  snippet: string;
  thumbnail: string | null;
  publishedDate: string | null;
}

export interface LightCrawlResult {
  posts: LightBlogPost[];
  query: string;
}

// ─── 네이버 검색 API ──────────────────────────────────

interface NaverApiItem {
  title: string;        // HTML 태그 포함 가능
  link: string;
  description: string;  // HTML 태그 포함 가능
  bloggername: string;
  bloggerlink: string;
  postdate: string;     // "20261215" 형태
}

interface NaverApiResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverApiItem[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

function extractBloggerId(url: string): string {
  const match = url.match(/blog\.naver\.com\/([^/?#]+)/);
  return match?.[1] ?? 'unknown';
}

function formatPostDate(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 8) return null;
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * 네이버 검색 API로 블로그를 검색한다.
 * @param query 검색어
 * @param display 한 번에 가져올 건수 (최대 100)
 * @param start 시작 위치 (1~1000)
 * @param sort sim(정확도순) | date(최신순)
 */
async function searchNaverBlogApi(
  query: string,
  display: number = 30,
  start: number = 1,
  sort: 'sim' | 'date' = 'sim',
): Promise<LightBlogPost[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('[naver-api] NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 미설정');
    return [];
  }

  const params = new URLSearchParams({
    query,
    display: String(Math.min(display, 100)),
    start: String(start),
    sort,
  });

  const url = `https://openapi.naver.com/v1/search/blog.json?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!res.ok) {
      console.warn(`[naver-api] HTTP ${res.status}: ${await res.text()}`);
      return [];
    }

    const data: NaverApiResponse = await res.json();

    return data.items
      .filter(item => item.link.includes('blog.naver.com'))
      .map(item => ({
        url: item.link,
        title: stripHtml(item.title),
        bloggerId: extractBloggerId(item.bloggerlink || item.link),
        snippet: stripHtml(item.description),
        thumbnail: null,
        publishedDate: formatPostDate(item.postdate),
      }));
  } catch (err) {
    console.warn('[naver-api] 검색 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── 블로그 본문 fetch (모바일 URL) ───────────────────

const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

interface BlogContentResult {
  text: string;
  thumbnail: string | null;
}

function extractThumbnail($: ReturnType<typeof cheerio.load>): string | null {
  // 본문 내 첫 번째 의미 있는 이미지 추출
  const imgSelectors = [
    '.se-main-container img',
    '.post_ct img',
    '#postViewArea img',
    '.se_component_wrap img',
    'img.se-image-resource',
  ];
  for (const sel of imgSelectors) {
    const img = $(sel).first();
    const src = img.attr('src') || img.attr('data-lazy-src') || img.attr('data-src') || '';
    if (src && src.startsWith('http') && !src.includes('static') && !src.includes('icon') && !src.includes('logo')) {
      return src;
    }
  }
  // og:image 메타 태그
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) return ogImage;

  return null;
}

async function fetchBlogContent(blogUrl: string): Promise<BlogContentResult> {
  const match = blogUrl.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
  if (!match) return { text: '', thumbnail: null };

  // 1차: 모바일 URL
  try {
    const mobileUrl = `https://m.blog.naver.com/${match[1]}/${match[2]}`;
    const res = await fetch(mobileUrl, { headers: { 'User-Agent': MOBILE_USER_AGENT } });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const thumbnail = extractThumbnail($);
      for (const sel of ['.post_ct', '.se-main-container', '#viewTypeSelector', '#postViewArea']) {
        const text = $(sel).text().replace(/\s+/g, ' ').trim();
        if (text.length > 100) return { text: text.slice(0, 3000), thumbnail };
      }
    }
  } catch {}

  // 2차: 데스크톱 PostView
  try {
    const desktopUrl = `https://blog.naver.com/PostView.naver?blogId=${match[1]}&logNo=${match[2]}`;
    const res = await fetch(desktopUrl, { headers: { 'User-Agent': DESKTOP_USER_AGENT } });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const thumbnail = extractThumbnail($);
      for (const sel of ['.se-main-container', '.se_component_wrap', '#postViewArea']) {
        const text = $(sel).text().replace(/\s+/g, ' ').trim();
        if (text.length > 100) return { text: text.slice(0, 3000), thumbnail };
      }
    }
  } catch {}

  // 3차: Puppeteer/Browserless 폴백 (환경변수 설정 시)
  if (process.env.BROWSERLESS_TOKEN || process.env.USE_LOCAL_PUPPETEER === 'true') {
    try {
      const { fetchWithPuppeteer } = await import('./puppeteer-fetcher');
      const result = await fetchWithPuppeteer(blogUrl);
      if (result.text.length > 100) {
        return { text: (result.text + ' ' + result.imageAlts).slice(0, 3000), thumbnail: null };
      }
    } catch (err) {
      console.warn('[blog-light] Puppeteer 폴백 실패:', err instanceof Error ? err.message : err);
    }
  }

  return { text: '', thumbnail: null };
}

// ─── 메인 함수: 전체 검색 ─────────────────────────────

/**
 * 네이버 검색 API로 블로그를 수집한다.
 * 2개 쿼리("추천" + "후기")로 검색, 중복 제거, 상위 건 본문 fetch.
 */
export async function crawlNaverBlogsLight(
  destination: string,
  category: string,
  maxPostsToFetch: number = 15,
): Promise<LightCrawlResult> {
  const queries = [
    `${destination} ${category} 추천`,
    `${destination} ${category} 후기`,
  ];

  const allPosts: LightBlogPost[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    // API 1회 호출로 최대 50건 (크롤링 대비 6배 효율)
    const results = await searchNaverBlogApi(query, 50, 1, 'sim');
    for (const post of results) {
      if (!seen.has(post.url)) {
        seen.add(post.url);
        allPosts.push(post);
      }
    }
  }

  console.log(`[naver-api] "${destination} ${category}" → ${allPosts.length}건 수집`);

  // 상위 건 본문 fetch (광고 키워드 감지용)
  const toFetch = allPosts.slice(0, maxPostsToFetch);
  for (let i = 0; i < toFetch.length; i++) {
    const content = await fetchBlogContent(toFetch[i].url);
    if (content.text.length > toFetch[i].snippet.length) {
      toFetch[i].snippet = content.text.slice(0, 2000);
    }
    if (content.thumbnail) {
      toFetch[i].thumbnail = content.thumbnail;
    }
    // API는 rate limit이 넉넉하므로 본문 fetch 간 짧은 딜레이만
    if (i < toFetch.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return { posts: allPosts, query: `${destination} ${category}` };
}

// ─── 장소별 개별 검색 (analyze에서 호출) ─────────────

/**
 * 장소명으로 개별 블로그 검색.
 * API 1회 호출로 최대 30건 — 크롤링보다 훨씬 빠르고 안정적.
 */
export async function searchBlogsForPlace(
  placeName: string,
  destination: string,
  maxResults: number = 20,
): Promise<LightBlogPost[]> {
  const query = `${placeName} ${destination}`;
  // 넉넉히 가져와서 필터 후 maxResults만 반환
  const raw = await searchNaverBlogApi(query, Math.min(maxResults * 2, 100), 1, 'sim');

  // 장소명의 핵심 단어가 제목 또는 본문에 포함된 것만 필터
  // "코지하우스 밀양점" → 핵심 단어: "코지하우스" (지역명/일반어 제외)
  const destLower = destination.toLowerCase();
  const skipWords = new Set([
    destLower, '맛집', '카페', '숙소', '관광', '추천', '후기', '리뷰',
    '본점', '지점', '점', '역', '센터', '관광지',
  ]);
  const coreWords = placeName.toLowerCase()
    .split(/[\s·,()\-&]+/)
    .filter(w => {
      if (w.length < 2) return false;
      if (skipWords.has(w)) return false;
      // "밀양점", "서울역" 등 지역명+접미사 패턴 제외
      if (w.endsWith('점') || w.endsWith('역') || w.endsWith('센터') || w.endsWith('관')) {
        const base = w.slice(0, -1);
        if (base === destLower || base.length <= 1) return false;
      }
      return true;
    });

  const filtered = raw.filter(post => {
    // 제목에 핵심 단어가 포함되어야 관련 있음 (본문은 우연 매칭 위험)
    const titleLower = post.title.toLowerCase();
    return coreWords.length === 0 || coreWords.some(w => titleLower.includes(w));
  }).slice(0, maxResults);

  // 본문 + 썸네일 fetch (전체)
  for (let i = 0; i < filtered.length; i++) {
    const content = await fetchBlogContent(filtered[i].url);
    if (content.text.length > filtered[i].snippet.length) {
      filtered[i].snippet = content.text.slice(0, 2000);
    }
    if (content.thumbnail) {
      filtered[i].thumbnail = content.thumbnail;
    }
    if (i < filtered.length - 1) await new Promise(r => setTimeout(r, 150));
  }

  return filtered;
}

// ─── 하위 호환: crawlNaverBlogsForPlaces ─────────────

export async function crawlNaverBlogsForPlaces(
  destination: string,
  category: string,
  placeNames: string[],
  maxPerPlace: number = 5,
): Promise<Map<string, LightBlogPost[]>> {
  const result = new Map<string, LightBlogPost[]>();

  for (const name of placeNames) {
    const posts = await searchBlogsForPlace(name, destination, maxPerPlace);
    result.set(name, posts);
  }

  return result;
}
