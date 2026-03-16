const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { launchBrowser, safeBrowserClose } = require("../utils/puppeteerHelper");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// passNum prefix → class1 select value 매핑
const PREFIX_TO_CLASS = {
  DAP: "1",
  DAsP: "2",
  DASP: "2",
  SQLP: "3",
  SQLD: "4",
  ADP: "5",
  ADsP: "6",
  ADSP: "6",
  BAE: "7",
};

/**
 * passNum에서 prefix(종목코드)와 certno(번호)를 분리
 * 예: "ADsP-045016134" → { prefix: "ADsP", certno: "045016134" }
 */
function parsePassNum(passNum) {
  const raw = String(passNum || "").trim();
  const dashIdx = raw.indexOf("-");
  if (dashIdx === -1) return { prefix: null, certno: raw };
  return { prefix: raw.slice(0, dashIdx), certno: raw.slice(dashIdx + 1) };
}

/**
 * 한국데이터산업진흥원 자격증 진위확인
 * - URL: https://www.dataq.or.kr/www/anno/cert/check.do
 * - tracerapi.js(개발자도구 감지) 차단 필수
 * - 성공 시 팝업 윈도우에서 결과 스크린샷
 * - 실패 시 alert "자격정보를 찾을 수 없습니다."
 */
async function dataqVerify(item, delayTime, directoryName) {
  let browser;
  try {
    // launchBrowser 대신 직접 launch (requestInterception과 충돌 방지)
    browser = await puppeteer.launch({
      headless: "new",
      protocolTimeout: 120000,
      args: [
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: { width: 1920, height: 1080 },
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // alert 처리
    let lastDialogMsg = "";
    page.on("dialog", async (dialog) => {
      lastDialogMsg = dialog.message();
      console.log(`📋 [${item.name}] Alert: ${lastDialogMsg}`);
      await dialog.accept();
    });

    // tracerapi.js (개발자도구 감지 스크립트) 차단
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().includes("tracer")) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // 페이지 접속
    const url = "https://www.dataq.or.kr/www/anno/cert/check.do";
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // passNum 파싱
    const { prefix, certno } = parsePassNum(item.passNum);
    const classValue = prefix ? (PREFIX_TO_CLASS[prefix] || PREFIX_TO_CLASS[prefix.toUpperCase()]) : null;

    if (!classValue) {
      throw new Error(`알 수 없는 자격종목 prefix: ${prefix} (passNum: ${item.passNum})`);
    }

    // 1. 자격종목 선택 + classnm 세팅
    await page.select("#class1", classValue);
    await page.evaluate(() => {
      const sel = document.querySelector("#class1");
      const selectedText = sel.options[sel.selectedIndex].text;
      const classnm = selectedText === "빅데이터분석기사" ? "BAE" : selectedText;
      document.querySelector('input[name="classnm"]').value = classnm;
    });

    // 2. 자격번호
    await page.type("#certno", certno);

    // 3. 성명
    await page.type("#name", String(item.name || ""));

    // 4. 조회목적 — 채용증빙
    await page.evaluate(() => {
      const radio = document.querySelector("#reqPurps_01");
      if (radio) {
        radio.checked = true;
        radio.click();
      }
    });

    // 5. 기관 정보
    await page.type("#reqOrg", "주식회사 인사바른");
    await page.type("#reqUser", "민태희");
    await page.type("#reqTel", "010-6440-0583");

    // 6. 팝업 감지 준비
    const popupPromise = new Promise((resolve) => {
      const handler = async (target) => {
        if (target.type() === "page") {
          browser.off("targetcreated", handler);
          resolve(await target.page());
        }
      };
      browser.on("targetcreated", handler);
      setTimeout(() => {
        browser.off("targetcreated", handler);
        resolve(null);
      }, 15000);
    });

    // 7. 진위 확인 버튼 클릭
    lastDialogMsg = "";
    await page.click(".io-fn-submit");

    // 8. 결과 대기
    await delay(delayTime);

    const popup = await popupPromise;

    if (popup) {
      // ✅ 성공 — 팝업에서 결과 파싱 + 스크린샷
      await delay(2000);

      const resultData = await popup.evaluate(() => {
        const tds = document.querySelectorAll("table td");
        const data = {};
        const ths = document.querySelectorAll("table th");
        ths.forEach((th, i) => {
          data[th.textContent.trim()] = tds[i]?.textContent.trim() || "";
        });
        return data;
      });

      item.result = 1;
      item.subs = resultData["종목"] || "";
      item.date = resultData["합격일자"] || "";

      const fileName = `${item.registerationNumber}_${item.certificateName}.png`;
      item.zipPath = `자격증/${directoryName}/${fileName}`;
      item.imageBase64 = await popup.screenshot({ encoding: "base64" });

      console.log(`✅ ${item.name} 진위확인 성공 — 종목: ${item.subs}, 합격일: ${item.date}`);
      await popup.close();
    } else if (lastDialogMsg) {
      // ❌ 실패 — alert
      item.result = 0;
      item.subs = "";
      item.date = "";
      item.zipPath = null;
      item.imageBase64 = null;
      item.error = lastDialogMsg;
      console.log(`❌ ${item.name} 진위확인 실패: ${lastDialogMsg}`);
    } else {
      // ⚠️ 팝업도 alert도 없음
      item.result = 0;
      item.zipPath = null;
      item.imageBase64 = null;
      item.error = "결과 없음 (타임아웃)";
      console.log(`⚠️ ${item.name} 결과 없음`);
    }

    await page.close();
  } catch (error) {
    console.error(`${item.name} 처리 중 오류 발생:`, error);
    item.result = 0;
    item.zipPath = null;
    item.imageBase64 = null;
    item.error = error.message;
  } finally {
    await safeBrowserClose(browser);
  }
}

module.exports = { dataqVerify };
