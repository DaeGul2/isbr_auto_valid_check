// server/utils/puppeteerHelper.js
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

// ✅ 현재 열려있는 브라우저 추적
const activeBrowsers = new Set();

const BROWSER_TIMEOUT = 2 * 60 * 1000; // 2분 — 브라우저 하나가 이 이상 살면 강제 종료

/**
 * 공통 브라우저 + 페이지 생성 유틸 함수
 * - 타임아웃 초과 시 자동으로 브라우저 종료 (좀비 방지)
 * - activeBrowsers에 등록되어 비상 시 전체 정리 가능
 */
async function launchBrowser(timeoutMs = BROWSER_TIMEOUT) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
    ],
    defaultViewport: null,
  });

  // ✅ 추적 등록
  activeBrowsers.add(browser);
  browser.on("disconnected", () => activeBrowsers.delete(browser));

  // ✅ 타임아웃 — 지정 시간 초과 시 강제 종료 (좀비 브라우저 방지)
  const killTimer = setTimeout(async () => {
    console.warn("⚠️ 브라우저 타임아웃 — 강제 종료합니다.");
    await safeBrowserClose(browser);
  }, timeoutMs);

  // 정상 종료 시 타이머 해제
  browser.on("disconnected", () => clearTimeout(killTimer));

  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  return { browser, page };
}

/**
 * ✅ 안전한 브라우저 종료 — 이미 닫혔거나 에러 나도 throw 안 함
 */
async function safeBrowserClose(browser) {
  try {
    if (browser && browser.connected) {
      await browser.close();
    }
  } catch (err) {
    console.warn("⚠️ 브라우저 종료 중 에러 (무시됨):", err.message);
  }
}

/**
 * ✅ 현재 열려있는 모든 브라우저 강제 종료 (비상용)
 */
async function closeAllBrowsers() {
  console.warn(`⚠️ 열려있는 브라우저 ${activeBrowsers.size}개 전체 종료`);
  const promises = [];
  for (const browser of activeBrowsers) {
    promises.push(safeBrowserClose(browser));
  }
  await Promise.allSettled(promises);
}

module.exports = { launchBrowser, safeBrowserClose, closeAllBrowsers };
