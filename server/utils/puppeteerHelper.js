// server/utils/puppeteerHelper.js
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

/**
 * 공통 브라우저 + 페이지 생성 유틸 함수
 * @returns {Promise<{ browser: puppeteer.Browser, page: puppeteer.Page }>}
 */
async function launchBrowser() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",   // 메모리 부족 방지
    ],
    defaultViewport: null,
    timeout: 60000,  // 브라우저 실행 타임아웃 60초
  });

  const page = await browser.newPage();

  // navigator.webdriver 속성 제거 (혹시 스텔스가 못 막을 때 대비)
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });
  });

  // User-Agent 통일
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  return { browser, page };
}

/**
 * 브라우저를 안전하게 종료 — close() 자체에서 에러가 나도 서버가 터지지 않음
 */
async function safeBrowserClose(browser) {
  try {
    if (browser) await browser.close();
  } catch (e) {
    console.error('⚠️ 브라우저 종료 중 오류 (무시):', e.message);
  }
}

module.exports = { launchBrowser, safeBrowserClose };
