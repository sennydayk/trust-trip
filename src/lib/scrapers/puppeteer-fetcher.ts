// Puppeteer/Browserless 하이브리드 fetcher
// 로컬 Chrome 또는 Browserless.io WebSocket 연결 자동 선택
// 블로그 본문 + 이미지 alt 텍스트 추출

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

  // 로컬 Chrome
  if (process.env.USE_LOCAL_PUPPETEER === 'true') {
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
  const match = blogUrl.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
  if (!match) return { text: '', imageAlts: '', method: 'local' };

  const { browser, method } = await getBrowser();

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    await page.setViewport({ width: 1280, height: 800 });

    // 불필요한 리소스 차단
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
