// server/functions/hanguksa.js
const { launchBrowser, safeBrowserClose } = require("../utils/puppeteerHelper");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBirth(birth) {
  if (!birth) throw new Error("생년월일 데이터가 없습니다.");

  const raw = String(birth).replace(/[^0-9]/g, "");
  if (raw.length === 6) {
    const yy = parseInt(raw.slice(0, 2), 10);
    const prefix = yy >= 50 ? "19" : "20";
    return `${prefix}${raw}`;
  }
  if (raw.length === 8) return raw;

  throw new Error(`생년월일 형식이 올바르지 않습니다: ${birth}`);
}

/**
 * ✅ 한국사 passNum 보정
 * - '-' 있으면 그대로
 * - 없으면 숫자만 뽑아서 "앞2자리-나머지"로 변환
 *   예) 4112345 -> 41-12345
 */
function normalizeHanguksaPassNum(passNum) {
  const s = String(passNum || "").trim();
  if (!s) return "";

  // 이미 하이픈 있으면 OK
  if (s.includes("-")) return s;

  // 숫자만 추출
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length < 3) return s; // 너무 짧으면 원본 유지

  // 앞 2자리 + 나머지
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/**
 * ✅ 생년월일 있는 버전 (기존 로직)
 * ❗기존 흐름 유지하되 passNum 하이픈 보정만 추가
 */
async function hanguksaVerifyWithBirth(item, delayTime, directoryName) {
  const { browser, page } = await launchBrowser();

  const verifyUrl =
    process.env.HANGUKSA_WITH_BIRTH_URL ||
    "https://www.historyexam.go.kr/etcPageLink.do?link=trueChk&...";

  await page.goto(verifyUrl, { waitUntil: "networkidle2" });

  try {
    // ✅ 여기서 passNum 보정
    const fixedPassNum = normalizeHanguksaPassNum(item.passNum);

    const [firstNum, secondNum] = String(fixedPassNum || "").split("-");
    if (!firstNum || !secondNum) {
      throw new Error("인증번호 형식이 올바르지 않습니다. (올바른 형식: xx-xxxxxx)");
    }

    // name
    await page.waitForSelector("#kr_name", { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector("#kr_name");
      if (el) el.value = "";
    });
    await page.type("#kr_name", String(item.name || ""));

    // certi_front/back
    await page.waitForSelector("#certi_front", { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector("#certi_front");
      if (el) el.value = "";
    });
    await page.type("#certi_front", String(firstNum));

    await page.waitForSelector("#certi_back", { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector("#certi_back");
      if (el) el.value = "";
    });
    await page.type("#certi_back", String(secondNum));

    // birth
    const formattedBirth = parseBirth(item.birth);
    await page.waitForSelector("#birth", { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector("#birth");
      if (el) el.value = "";
    });
    await page.type("#birth", String(formattedBirth));

    // submit
    await page.waitForSelector("#btnConfirm", { timeout: 10000 });
    await page.click("#btnConfirm");

    await delay(delayTime);

    // 결과 파싱
    const result = await page.evaluate(() => {
      const tbody = document.querySelector("tbody");
      if (!tbody) return null;

      const resultData = {};
      const rows = Array.from(tbody.querySelectorAll("tr"));
      rows.forEach((row) => {
        const ths = Array.from(row.querySelectorAll("th"));
        const tds = Array.from(row.querySelectorAll("td"));

        ths.forEach((th, idx) => {
          const key = (th.textContent || "").trim();
          const value = (tds[idx]?.textContent || "").trim();
          if (key && value) resultData[key] = value;
        });
      });

      if (resultData["합격여부"]) {
        return {
          isValid: true,
          data: {
            회차: resultData["회차"],
            성명: resultData["성명"],
            등급: resultData["등급"],
            합격여부: resultData["합격여부"],
          },
        };
      }
      return { isValid: false, data: null };
    });

    if (result?.isValid) {
      const { 회차, 등급, 합격여부 } = result.data;

      item.date = 회차 || "";
      item.result = String(합격여부 || "").trim() === "합격" ? 1 : 0;
      item.subs = 등급 ? `한국사능력검정시험${등급}` : "";

      const fileName = `${item.registerationNumber}_${item.certificateName}.png`;
      item.zipPath = `자격증/${directoryName}/${fileName}`;
      item.imageBase64 = await page.screenshot({ encoding: "base64" });
    } else {
      item.date = "";
      item.result = 0;
      item.subs = "";
      item.zipPath = null;
      item.imageBase64 = null;
    }

    await delay(delayTime);
  } catch (error) {
    console.error(`${item.name} 처리 중 오류 발생:`, error);
    item.zipPath = null;
    item.imageBase64 = null;
    item.result = 0;
    item.error = error.message;
  } finally {
    await safeBrowserClose(browser);
  }
}

/**
 * ✅ 생년월일 없는 버전 (정부24)
 * - URL: https://www.gov.kr/mw/KoreaHistoryCertTruthInfo.do
 * - userNm = name
 * - authCd = passNum(보정 적용)
 * - fn_search() 클릭
 * - body 텍스트에서 성공/실패 키워드 뜰 때까지 대기
 */
async function hanguksaVerifyNoBirth(item, delayTime, directoryName) {
  const { browser, page } = await launchBrowser();

  page.on("dialog", async (d) => {
    try {
      await d.accept();
    } catch (e) {}
  });

  const url = "https://www.gov.kr/mw/KoreaHistoryCertTruthInfo.do";
  await page.goto(url, { waitUntil: "networkidle2" });

  try {
    await page.waitForSelector("#userNm", { timeout: 15000 });
    await page.waitForSelector("#authCd", { timeout: 15000 });

    // ✅ passNum 보정
    const fixedPassNum = normalizeHanguksaPassNum(item.passNum);

    // userNm
    await page.evaluate(() => {
      const el = document.querySelector("#userNm");
      if (el) el.value = "";
    });
    await page.type("#userNm", String(item.name || ""), { delay: 20 });

    // authCd
    await page.evaluate(() => {
      const el = document.querySelector("#authCd");
      if (el) el.value = "";
    });
    await page.type("#authCd", String(fixedPassNum || ""), { delay: 20 });

    // 조회 실행
    const btn = await page.$('a[href="javaScript:fn_search();"]');
    if (btn) {
      await btn.click();
    } else {
      await page.evaluate(() => {
        if (typeof fn_search === "function") fn_search();
      });
    }

    const successKey = "인증서 진위확인";
    const failKey = "해당되는 인증번호가 없습니다";

    await page.waitForFunction(
      (sKey, fKey) => {
        const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
        return text.includes(sKey) || text.includes(fKey);
      },
      { timeout: 30000 },
      successKey,
      failKey
    );

    const isOk = await page.evaluate((sKey, fKey) => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      if (text.includes(fKey)) return false;
      return text.includes(sKey);
    }, successKey, failKey);

    item.result = isOk ? 1 : 0;
    item.date = "";
    item.subs = "";

    const fileName = `${item.registerationNumber}_${item.certificateName}.png`;
    item.zipPath = `자격증/${directoryName}/${fileName}`;
    item.imageBase64 = await page.screenshot({ encoding: "base64", fullPage: true });

    await delay(delayTime);
  } catch (error) {
    console.error(`${item.name} (국사 noBirth) 처리 중 오류:`, error);
    item.result = 0;
    item.zipPath = null;
    item.imageBase64 = null;
    item.error = error.message;
  } finally {
    await safeBrowserClose(browser);
  }
}

module.exports = {
  hanguksaVerifyWithBirth,
  hanguksaVerifyNoBirth,
};
