# 블로그 크롤링 및 광고 감지 개선 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블로그 본문 수집 성공률을 30%→80%로 향상하고, 광고 감지율을 0.5건→5건/케이스로 10배 개선한다.

**Architecture:** 3단계 폴백 크롤링(fetch→모바일→Puppeteer) + 하단 광고 키워드 강화 + Claude Haiku LLM 2차 판별 활성화. 배포는 Vercel + Browserless.io 하이브리드.

**Tech Stack:** Next.js 14, puppeteer-core, @anthropic-ai/sdk, Cheerio, Vercel, Browserless.io

---

## File Structure

| 파일 | 변경 유형 | 역할 |
|------|----------|------|
| `src/lib/scrapers/naver-blog-light.ts` | 수정 | fetchBlogContent에 모바일 폴백 + Puppeteer 폴백 추가 |
| `src/lib/scrapers/puppeteer-fetcher.ts` | 신규 | Puppeteer/Browserless 연동 모듈 (로컬/원격 자동 감지) |
| `src/lib/analyzers/ad-detector.ts` | 수정 | 하단 광고 키워드 추가 + analyzeAd 호출 경로 정리 |
| `src/lib/pipeline/stages/analyze.ts` | 수정 | convertToBlogPosts에서 비동기 LLM 판별 호출 |
| `package.json` | 수정 | puppeteer → puppeteer-core |
| `.env.local.example` | 수정 | BROWSERLESS_TOKEN 추가 |
| `vercel.json` | 신규 | Vercel 배포 설정 |

---

## Chunk 1: 단계 A — 모바일 URL 폴백

### Task 1: fetchBlogContent에 모바일 폴백 추가

**Files:**
- Modify: `src/lib/scrapers/naver-blog-light.ts:106-128`

- [ ] **Step 1: 모바일 URL fetch 함수 추가**

`fetchBlogContent` 바로 위에 모바일 전용 fetch 함수를 추가한다.
모바일 네이버 블로그(`m.blog.naver.com`)는 iframe 없이 본문이 직접 HTML에 포함되어 있어 fetch 성공률이 높다.

```typescript
async function fetchMobileBlogContent(blogUrl: string): Promise<string> {
  const match = blogUrl.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/);
  if (!match) return '';

  const mobileUrl = `https://m.blog.naver.com/${match[1]}/${match[2]}`;

  try {
    const res = await fetch(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
    });
    if (!res.ok) return '';

    const html = await res.text();
    const $ = cheerio.load(html);

    // 모바일 본문 셀렉터
    const selectors = [
      '.se-main-container',
      '.post_ct',
      '.se_component_wrap',
      '#viewTypeSelector',
      '#postViewArea',
    ];

    for (const sel of selectors) {
      const text = $(sel).text().replace(/\s+/g, ' ').trim();
      if (text.length > 100) return text.slice(0, 3000);
    }

    return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
  } catch {
    return '';
  }
}
```

- [ ] **Step 2: fetchBlogContent를 3단계 폴백으로 리팩터**

기존 `fetchBlogContent`를 `fetchDesktopBlogContent`로 이름 변경하고, 새로운 `fetchBlogContent`를 3단계 폴백 래퍼로 만든다.

```typescript
// 기존 함수 이름 변경
async function fetchDesktopBlogContent(blogUrl: string): Promise<string> {
  // ... 기존 코드 그대로 ...
}

// 3단계 폴백 래퍼
async function fetchBlogContent(blogUrl: string): Promise<string> {
  // 1차: 데스크톱 PostView fetch
  const desktop = await fetchDesktopBlogContent(blogUrl);
  if (desktop.length > 200) return desktop;

  // 2차: 모바일 URL fetch
  const mobile = await fetchMobileBlogContent(blogUrl);
  if (mobile.length > 200) return mobile;

  // 3차: Puppeteer (환경변수 설정 시)
  if (process.env.BROWSERLESS_TOKEN || process.env.USE_LOCAL_PUPPETEER === 'true') {
    try {
      const { fetchWithPuppeteer } = await import('./puppeteer-fetcher');
      const result = await fetchWithPuppeteer(blogUrl);
      if (result.text.length > 200) return result.text + ' ' + result.imageAlts;
    } catch (err) {
      console.warn('[blog-light] Puppeteer 폴백 실패:', err instanceof Error ? err.message : err);
    }
  }

  // 폴백: 가장 긴 결과 반환
  return desktop.length > mobile.length ? desktop : mobile;
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npx next build 2>&1 | grep -E 'Compiled|error'`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/lib/scrapers/naver-blog-light.ts
git commit -m "feat: add mobile URL fallback for blog content fetch"
```

---

## Chunk 2: 단계 D — Puppeteer/Browserless 연동

### Task 2: puppeteer-core 전환 + Puppeteer fetcher 모듈

**Files:**
- Modify: `package.json`
- Create: `src/lib/scrapers/puppeteer-fetcher.ts`
- Modify: `src/lib/scrapers/naver-blog.ts:5` (import 변경)
- Modify: `.env.local.example`

- [ ] **Step 1: puppeteer → puppeteer-core 전환**

```bash
npm uninstall puppeteer
npm install puppeteer-core
```

`puppeteer-core`는 Chrome 바이너리를 포함하지 않아 패키지 크기가 ~2MB (vs puppeteer ~300MB).
로컬에서는 설치된 Chrome을 사용하고, 배포에서는 Browserless.io에 WebSocket으로 연결한다.

- [ ] **Step 2: naver-blog.ts import 수정**

`src/lib/scrapers/naver-blog.ts` 5번 라인의 import를 변경한다:

```typescript
// Before
import puppeteer, { type Browser, type Page } from 'puppeteer';
// After
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
```

- [ ] **Step 3: Puppeteer fetcher 모듈 생성**

Puppeteer를 사용해 블로그 본문 + 이미지 alt 텍스트를 추출하는 모듈.
로컬 Chrome과 Browserless.io를 환경변수로 자동 선택한다.

```typescript
// src/lib/scrapers/puppeteer-fetcher.ts
import puppeteer from 'puppeteer-core';

export interface PuppeteerFetchResult {
  text: string;
  imageAlts: string;
  method: 'local' | 'browserless';
}

async function getBrowser() {
  // Browserless.io 토큰이 있으면 원격 연결
  if (process.env.BROWSERLESS_TOKEN) {
    return {
      browser: await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`,
      }),
      method: 'browserless' as const,
    };
  }

  // 로컬 Chrome (개발 환경)
  if (process.env.USE_LOCAL_PUPPETEER === 'true') {
    // OS별 Chrome 경로 자동 감지
    const executablePath =
      process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/chromium';

    return {
      browser: await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      }),
      method: 'local' as const,
    };
  }

  throw new Error('Puppeteer 환경변수 미설정 (BROWSERLESS_TOKEN 또는 USE_LOCAL_PUPPETEER)');
}

export async function fetchWithPuppeteer(blogUrl: string): Promise<PuppeteerFetchResult> {
  const match = blogUrl.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/);
  if (!match) return { text: '', imageAlts: '', method: 'local' };

  const { browser, method } = await getBrowser();

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    await page.setViewport({ width: 1280, height: 800 });

    // 리소스 차단 (속도 향상)
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (type === 'font' || type === 'media' || type === 'stylesheet') {
        req.abort();
      } else {
        req.continue();
      }
    });

    const postViewUrl = `https://blog.naver.com/PostView.naver?blogId=${match[1]}&logNo=${match[2]}`;
    await page.goto(postViewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // iframe 내부 접근
    let contentFrame = page.mainFrame();
    const iframeHandle = await page.$('#mainFrame');
    if (iframeHandle) {
      const frame = await iframeHandle.contentFrame();
      if (frame) {
        contentFrame = frame;
        await contentFrame.waitForSelector(
          '.se-main-container, #postViewArea, .se_component_wrap',
          { timeout: 8000 },
        ).catch(() => {});
      }
    }

    // 본문 + 이미지 alt 텍스트 추출
    const result = await contentFrame.evaluate(() => {
      // 본문
      const selectors = ['.se-main-container', '.se_component_wrap', '#postViewArea', '.post-view'];
      let text = '';
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          if (t.length > text.length) text = t;
        }
      }

      // 이미지 alt 텍스트 (광고 이미지에 포함된 텍스트)
      const imgs = document.querySelectorAll('img');
      const alts = Array.from(imgs)
        .map(img => (img.alt || img.title || '').trim())
        .filter(a => a.length > 5)
        .join(' ');

      return { text: text.slice(0, 3000), imageAlts: alts.slice(0, 500) };
    });

    await page.close();
    return { ...result, method };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: .env.local.example에 환경변수 추가**

```
# Browserless.io (Puppeteer 원격 실행)
BROWSERLESS_TOKEN=
# 로컬 Puppeteer 사용 (개발 환경)
USE_LOCAL_PUPPETEER=true
```

- [ ] **Step 5: 빌드 확인**

Run: `npx next build 2>&1 | grep -E 'Compiled|error'`
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add src/lib/scrapers/puppeteer-fetcher.ts src/lib/scrapers/naver-blog.ts package.json .env.local.example
git commit -m "feat: add Puppeteer/Browserless hybrid fetcher module"
```

---

## Chunk 3: 단계 B — 하단 광고 키워드 감지 강화

### Task 3: ad-detector에 하단 광고 키워드 + 네이버 정보성 마크 감지 추가

**Files:**
- Modify: `src/lib/analyzers/ad-detector.ts:9-20` (CONFIRMED_AD_KEYWORDS 확장)

- [ ] **Step 1: 확정 광고 키워드 확장**

블로그 하단에 자주 사용되는 광고 고지 변형을 추가한다.

```typescript
const CONFIRMED_AD_KEYWORDS = [
  // 기존 15개
  '소정의 원고료를 받아',
  '업체로부터 제공받아',
  '협찬을 받아 작성',
  '체험단으로 방문',
  '광고임을 알려드립니다',
  '경제적 대가를 받',
  '무상으로 제공받',
  '대가성 포스팅',
  '본 포스팅은 광고',
  '내돈내산 아님',
  '업체 측의 요청으로',
  '#광고', '#협찬', '#체험단',
  '원고료를 지급받',
  '제품을 무료로 제공',
  '서비스를 제공받아',
  // 추가: 하단 광고 고지 변형
  '원고료를 받고 작성',
  '원고료를 제공받',
  '대가를 받고 작성',
  '무료로 제공받아 작성',
  '업체로부터 지원받',
  '마케팅 목적으로 작성',
  '이 포스팅은 업체',
  '광고를 포함하고',
  '광고 포스팅',
  '업체 협찬으로',
  '제공받은 제품',
  '파트너스 활동',
  '일정 커미션',
  '쿠팡 파트너스',
  '이 포스팅은 제휴',
];
```

- [ ] **Step 2: 빌드 확인**

Run: `npx next build 2>&1 | grep -E 'Compiled|error'`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyzers/ad-detector.ts
git commit -m "feat: expand confirmed ad keywords for blog footer patterns"
```

---

## Chunk 4: 단계 C — LLM 2차 판별 활성화

### Task 4: analyze.ts에서 비동기 LLM 광고 판별 호출

**Files:**
- Modify: `src/lib/pipeline/stages/analyze.ts:1-8` (import 추가)
- Modify: `src/lib/pipeline/stages/analyze.ts:245-260` (convertToBlogPosts → 비동기)

- [ ] **Step 1: analyzeAd import 추가**

```typescript
// 기존
import { analyzeAdByRules, type AdAnalysisResult } from '@/lib/analyzers/ad-detector';
// 변경
import { analyzeAdByRules, analyzeAd, type AdAnalysisResult } from '@/lib/analyzers/ad-detector';
```

- [ ] **Step 2: convertToBlogPosts를 비동기로 변경**

`suspected` 결과가 나온 블로그에 대해서만 LLM 2차 판별을 호출한다.
전체를 LLM에 보내면 비용이 과다하므로, 룰 기반 의심 건만 대상.

```typescript
async function convertToBlogPosts(
  posts: LightBlogPost[],
  placeName: string,
): Promise<BlogPost[]> {
  const results: BlogPost[] = [];

  for (const post of posts) {
    // 1차: 룰 기반 판별
    const ruleResult = analyzeAdByRules(post.snippet, {
      content: post.snippet,
      title: post.title,
      blogger_id: post.bloggerId,
      text_length: post.snippet.length,
      place_name: placeName,
    });

    let finalAnalysis = ruleResult;

    // 2차: suspected인 경우에만 LLM 호출
    if (ruleResult.rule_result === 'suspected' && process.env.ANTHROPIC_API_KEY) {
      try {
        const llmResult = await analyzeAd({
          content: post.snippet,
          title: post.title,
          blogger_id: post.bloggerId,
          text_length: post.snippet.length,
          place_name: placeName,
        });
        finalAnalysis = llmResult;
      } catch {
        // LLM 실패 시 룰 결과 유지
      }
    }

    results.push({
      url: post.url,
      title: post.title,
      content_snippet: post.snippet.slice(0, 500),
      ad_analysis: finalAnalysis,
    });
  }

  return results;
}
```

- [ ] **Step 3: analyzePlaces에서 convertToBlogPosts 호출을 await로 변경**

`convertToBlogPosts`가 async가 되었으므로, 호출하는 곳에서 await를 추가한다.
`analyzePlaces`의 `places.map` 안에서 호출하므로, map을 `Promise.all`로 감싼다.

analyzePlaces 함수의 `return places.map(place => {` 부분을:

```typescript
return Promise.all(places.map(async place => {
  // ... 기존 코드 ...

  // blogPosts 할당 부분을 await로 변경
  blogPosts = await convertToBlogPosts(distributed, place.name);

  // ... 나머지 코드 ...
}));
```

- [ ] **Step 4: 빌드 확인**

Run: `npx next build 2>&1 | grep -E 'Compiled|error'`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/stages/analyze.ts
git commit -m "feat: activate LLM ad detection for suspected blog posts"
```

---

## Chunk 5: 배포 설정 (Vercel + Browserless)

### Task 5: Vercel 배포 설정

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: vercel.json 생성**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["icn1"],
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 120
    }
  }
}
```

`maxDuration: 120`은 API Route의 타임아웃을 120초로 설정. 블로그 크롤링 + LLM 호출에 충분한 시간.
`regions: ["icn1"]`은 서울 리전으로, 네이버/카카오 API 호출 지연 최소화.

- [ ] **Step 2: .env.local.example 최종 업데이트**

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google
GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

# Kakao
KAKAO_REST_API_KEY=

# Anthropic (광고 판별 LLM)
ANTHROPIC_API_KEY=

# Browserless.io (Puppeteer 원격 실행 — 배포 환경)
BROWSERLESS_TOKEN=

# 로컬 Puppeteer (개발 환경에서만 true)
USE_LOCAL_PUPPETEER=true

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 3: 빌드 + 로컬 테스트**

```bash
rm -rf .next && npx next build
npx next start -p 3099 &
sleep 3
curl -s http://localhost:3099/api/search \
  -X POST -H 'Content-Type: application/json' \
  -d '{"destination":"전주","category":"맛집"}' | node -e "
const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
  console.log(JSON.parse(Buffer.concat(c)).session_id);
})"
```

Expected: 세션 ID 반환, 파이프라인 정상 실행

- [ ] **Step 4: Commit**

```bash
git add vercel.json .env.local.example
git commit -m "feat: add Vercel deployment config with Browserless support"
```

---

## 검증 테스트

전체 구현 완료 후, 기존 20개 테스트 케이스 중 광고 감지가 중요한 5개를 재실행하여 개선 효과를 측정한다.

```bash
# 테스트 대상 (기존 광고 0~1건이던 케이스)
- A2 오사카 맛집 (기존 0건)
- A5 제주 카페 (기존 0건)
- B5 홍대 이자카야 (기존 1건)
- B8 삿포로 수프카레 (기존 0건)
- B9 전주 한옥마을 맛집 (기존 7건 → 기준선)
```

**성공 기준:**
- 본문 fetch 성공률: 30% → 70% 이상
- 광고 감지: 평균 0.5건 → 3건 이상/케이스
- 빌드 에러 없음
- 응답시간 120초 이내
