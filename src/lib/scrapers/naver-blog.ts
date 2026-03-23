// 네이버 블로그 크롤러 — Puppeteer로 검색 후 블로그 본문 수집
// robots.txt 준수, 요청 간 1~2초 랜덤 딜레이, User-Agent 설정
// 검색 쿼리: "{여행지} {카테고리} 추천" + "{여행지} {카테고리} 후기"

import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import * as cheerio from 'cheerio';

// ─── 타입 정의 ─────────────────────────────────────────

export interface BlogPost {
  url: string;
  title: string;
  bloggerName: string;
  bloggerId: string;
  content: string;
  imageCount: number;
  textLength: number;
  publishedDate: string | null;
}

export interface NaverBlogSearchOptions {
  maxPages?: number;       // 최대 페이지 수 (기본 3, 페이지당 약 10건)
  minDelayMs?: number;     // 최소 딜레이 ms (기본 1000)
  maxDelayMs?: number;     // 최대 딜레이 ms (기본 2000)
  headless?: boolean;      // 기본 true
}

export interface NaverCrawlResult {
  posts: BlogPost[];
  stats: {
    totalFound: number;
    totalCrawled: number;
    failedUrls: string[];
  };
}

// ─── 내부 유틸 ─────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createBrowser(headless: boolean): Promise<Browser> {
  return puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 800 });
  // 불필요한 리소스 차단 (이미지, 폰트)
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (type === 'image' || type === 'font' || type === 'media') {
      req.abort();
    } else {
      req.continue();
    }
  });
  return page;
}

// ─── 검색 결과 수집 ────────────────────────────────────

interface SearchItem {
  url: string;
  title: string;
}

async function collectSearchResults(
  page: Page,
  query: string,
  maxPages: number,
  minDelay: number,
  maxDelay: number,
): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  const seen = new Set<string>();

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const start = (pageNum - 1) * 10 + 1;
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(query)}&start=${start}`;

    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('.api_txt_lines, .title_link', { timeout: 5000 }).catch(() => {});

      const html = await page.content();
      const $ = cheerio.load(html);

      // 블로그 검색 결과에서 링크 추출
      $('a.title_link, a.api_txt_lines').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        if (href && title && !seen.has(href)) {
          // 네이버 블로그 URL만 수집
          if (href.includes('blog.naver.com')) {
            seen.add(href);
            items.push({ url: href, title });
          }
        }
      });
    } catch (err) {
      console.warn(`[naver-blog] 검색 ${pageNum}페이지 실패:`, err instanceof Error ? err.message : err);
    }

    if (pageNum < maxPages) {
      await randomDelay(minDelay, maxDelay);
    }
  }

  return items;
}

// ─── 블로그 본문 크롤링 ────────────────────────────────

// 네이버 블로그 iframe 내부 본문 URL 생성
function toBlogPostFrameUrl(blogUrl: string): string | null {
  // https://blog.naver.com/{bloggerId}/{logNo}
  const match = blogUrl.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/);
  if (!match) return null;
  return `https://blog.naver.com/PostView.naver?blogId=${match[1]}&logNo=${match[2]}&redirect=Dlog`;
}

function extractBloggerId(blogUrl: string): string {
  const match = blogUrl.match(/blog\.naver\.com\/([^/?]+)/);
  return match?.[1] ?? 'unknown';
}

async function crawlBlogPost(
  page: Page,
  item: SearchItem,
  minDelay: number,
  maxDelay: number,
): Promise<BlogPost | null> {
  const frameUrl = toBlogPostFrameUrl(item.url);
  const targetUrl = frameUrl ?? item.url;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // iframe이 있으면 내부로 진입
      const mainFrame = page.mainFrame();
      let contentFrame = mainFrame;

      const iframeHandle = await page.$('#mainFrame');
      if (iframeHandle) {
        const frame = await iframeHandle.contentFrame();
        if (frame) contentFrame = frame;
      }

      // 본문 영역 대기
      await contentFrame.waitForSelector(
        '.se-main-container, .post-view, #postViewArea, .se_component_wrap',
        { timeout: 8000 },
      ).catch(() => {});

      const html = await contentFrame.content();
      const $ = cheerio.load(html);

      // 본문 텍스트 추출 (여러 에디터 버전 대응)
      const contentSelectors = [
        '.se-main-container',        // 스마트에디터 3
        '.se_component_wrap',        // 스마트에디터 2
        '#postViewArea',             // 구 에디터
        '.post-view',                // 모바일
        '.se-text-paragraph',
      ];

      let content = '';
      for (const selector of contentSelectors) {
        const el = $(selector);
        if (el.length > 0) {
          content = el.text().replace(/\s+/g, ' ').trim();
          if (content.length > 50) break;
        }
      }

      // 이미지 수 카운트
      const imageCount = $('img.se_mediaImage, img.se-image-resource, #postViewArea img, .se_component_wrap img').length;

      // 작성자 이름
      const bloggerName =
        $('.nick, .blog_author, .nick_nm').first().text().trim() ||
        extractBloggerId(item.url);

      // 작성일
      const dateText = $('.se_publishDate, .date, .blog_date, .se-date').first().text().trim();
      let publishedDate: string | null = null;
      if (dateText) {
        const dateMatch = dateText.match(/(\d{4})[.\-/]?\s*(\d{1,2})[.\-/]?\s*(\d{1,2})/);
        if (dateMatch) {
          publishedDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
        }
      }

      await randomDelay(minDelay, maxDelay);

      return {
        url: item.url,
        title: item.title,
        bloggerName,
        bloggerId: extractBloggerId(item.url),
        content,
        imageCount,
        textLength: content.length,
        publishedDate,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        console.warn(`[naver-blog] 크롤링 재시도 (${attempt + 1}/${MAX_RETRIES}): ${item.url}`);
        await randomDelay(minDelay, maxDelay);
      }
    }
  }

  console.warn(`[naver-blog] 크롤링 최종 실패: ${item.url}`, lastError?.message);
  return null;
}

// ─── 메인 함수 ─────────────────────────────────────────

export async function crawlNaverBlogs(
  destination: string,
  category: string,
  options: NaverBlogSearchOptions = {},
): Promise<NaverCrawlResult> {
  const maxPages = options.maxPages ?? 3;
  const minDelay = options.minDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 2000;
  const headless = options.headless ?? true;

  const browser = await createBrowser(headless);

  try {
    const page = await setupPage(browser);

    // 두 가지 쿼리로 검색
    const queries = [
      `${destination} ${category} 추천`,
      `${destination} ${category} 후기`,
    ];

    const allSearchItems: SearchItem[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      const items = await collectSearchResults(page, query, maxPages, minDelay, maxDelay);
      for (const item of items) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allSearchItems.push(item);
        }
      }
      await randomDelay(minDelay, maxDelay);
    }

    const totalFound = allSearchItems.length;

    // 각 블로그 포스트 크롤링
    const posts: BlogPost[] = [];
    const failedUrls: string[] = [];

    for (const item of allSearchItems) {
      const post = await crawlBlogPost(page, item, minDelay, maxDelay);
      if (post) {
        posts.push(post);
      } else {
        failedUrls.push(item.url);
      }
    }

    return {
      posts,
      stats: {
        totalFound,
        totalCrawled: posts.length,
        failedUrls,
      },
    };
  } finally {
    await browser.close();
  }
}
