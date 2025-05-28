const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { getResultScreenshotPath } = require("./utils");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIssuedDate(date) {
  if (!date) throw new Error("발급일자가 없습니다.");
  const raw = String(date).replace(/[^0-9]/g, "");

  if (raw.length === 6) {
    const year = parseInt(raw.slice(0, 2), 10);
    const prefix = year >= 50 ? "19" : "20";
    return `${prefix}${raw}`.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  } else if (raw.length === 8) {
    return raw.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  } else if (raw.length === 10 && date.includes("-")) {
    return raw;
  } else {
    throw new Error(`발급일자 형식이 올바르지 않습니다: ${date}`);
  }
}

async function npsVerify(item, delayTime) {
  const url = "https://nps.or.kr/elctcvlcpt/etc/getOHAC0065M0.do";
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
    defaultViewport: null,
  });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle2" });
    console.log("✅ 국민연금 진위확인 페이지 접속 완료");

    // 발급번호 처리
    let passNumRaw = (item.passNum || "").trim();
    if (passNumRaw.includes("-")) {
      passNumRaw = passNumRaw.split("-").join("");
    }
    await page.type("#issuNo", passNumRaw);
    console.log("✅ 발급번호 입력 완료:", passNumRaw);

    // 발급일자 처리
    const formattedIssuedDate = parseIssuedDate(item.issuedDate);
    await page.type("#issuYmd", formattedIssuedDate);
    console.log("✅ 발급일자 입력 완료:", formattedIssuedDate);

    // 검증번호 처리
    const extraNum = (item.extraNum || "").trim().toUpperCase();
    if (!extraNum) {
      throw new Error("검증번호(extraNum)가 없습니다.");
    }
    await page.type("#whcfVrfcNo", extraNum);
    console.log("✅ 검증번호 입력 완료:", extraNum);

    // 조회 버튼 클릭
    await page.click('a[href="javascript:fncSearch();"]');
    console.log("✅ 조회 버튼 클릭 완료");

    // 대기
    await delay(delayTime);

    // 결과 내용 추출
    const topMsgText = await page.evaluate(() => {
      const box = document.querySelector(".top-msg-box");
      return box ? box.innerText : "";
    });

    if (topMsgText.includes("발급하셨습니다")) {
      item.result = 1;
      const fileName = `${item.registerationNumber}_${item.name}_${item.certificateName}.png`;
      item.zipPath = `국민연금가입자증명/${fileName}`;
      const buffer = await page.screenshot({ encoding: "base64" });
      item.imageBase64 = buffer;
      console.log(`✅ ${item.name} - 진위확인 성공 및 스크린샷 저장`);
    } else {
      item.result = 0;
      item.zipPath = null;
      item.imageBase64 = null;
      console.log(`❌ ${item.name} - 진위확인 실패 또는 결과 미일치`);
    }
  } catch (error) {
    console.error(`${item.name} 처리 중 오류 발생:`, error);
    item.result = 0;
    item.zipPath = null;
    item.imageBase64 = null;
    item.error = error.message;
  } finally {
    await browser.close();
  }
}

module.exports = { npsVerify };
