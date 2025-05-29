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
    headless: true, // 필요 시 "new" 또는 true 로 변경 가능
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
    ],
    defaultViewport: null,
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

module.exports = { launchBrowser };
