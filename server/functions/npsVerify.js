const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { getResultScreenshotPath } = require("./utils"); // 스크린샷 경로 함수 사용

// 딜레이 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 발급일자 포맷 변환 함수 (hanguksa.js 참고)
function parseIssuedDate(date) {
    if (!date) {
        throw new Error("발급일자가 없습니다.");
    }

    const raw = String(date).replace(/[^0-9]/g, ""); // 숫자만 남김

    if (raw.length === 6) {
        const year = parseInt(raw.slice(0, 2), 10);
        const prefix = year >= 50 ? "19" : "20";
        return `${prefix}${raw}`.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"); // yyyy-mm-dd
    } else if (raw.length === 8) {
        return raw.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"); // yyyy-mm-dd
    } else if (raw.length === 10 && date.includes("-")) {
        return raw; // 이미 yyyy-mm-dd 형식
    } else {
        throw new Error(`발급일자 형식이 올바르지 않습니다: ${date}`);
    }
}

// 국민연금가입자증명 진위 확인 함수
async function npsVerify(item, delayTime) {

    const formattedIssuedDate = parseIssuedDate(item.issuedDate);
    console.log("발급일 : ", formattedIssuedDate);

    const url = "https://minwon.nps.or.kr/jsppage/service/common/certificateTruth.jsp";
    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized"],
        defaultViewport: null,
    });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: "networkidle2" });
        console.log("✅ 국민연금가입자증명 진위확인 페이지 접속 완료");

        // (1) passNum 파싱 및 입력
        const passParts = (item.passNum || "").split("-");
        if (passParts.length !== 3) {
            throw new Error(`발급번호(passNum) 형식이 올바르지 않습니다: ${item.passNum}`);
        }

        await page.type('input[name="issu_no1"]', passParts[0]);
        await page.type('input[name="issu_no2"]', passParts[1]);
        await page.type('input[name="issu_no3"]', passParts[2]);
        console.log("✅ 발급번호 입력 완료:", passParts);

        // (2) 발급일자 입력
        const formattedIssuedDate = parseIssuedDate(item.issuedDate);
        console.log("발급일 : ", formattedIssuedDate);
        await page.evaluate(() => {
            document.querySelector('input[name="issu_dt"]').removeAttribute('readonly');
        });
        await page.type('input[name="issu_dt"]', formattedIssuedDate);
        console.log("✅ 발급일자 입력 완료:", formattedIssuedDate);

        // (3) 검증번호 입력
        const extraNum = (item.extraNum || "").trim();
        if (!extraNum) {
            throw new Error("검증번호(extraNum)가 없습니다.");
        }
        await page.type('input[name="veri_no"]', extraNum);
        console.log("✅ 검증번호 입력 완료:", extraNum);

        // (4) 조회 버튼 클릭
        await page.click('a[href="javascript:Search();"]');
        console.log("✅ 조회 버튼 클릭 완료");

        // (5) 결과 대기
        await delay(delayTime);

        const pageContent = await page.content();
        if (pageContent.includes("존재하지 않습니다")) {
            item.result = 0;
            console.log(`❌ ${item.name} - 증명서 존재하지 않음`);
        } else if (pageContent.includes("발급 하셨습니다")) {
            item.result = 1;
            const fileName = `${item.registerationNumber}_${item.name}_${item.certificateName}.png`;
            item.zipPath = `국민연금가입자증명/${fileName}`;
            const buffer = await page.screenshot({ encoding: 'base64' });
            item.imageBase64 = buffer;

        } else {
            item.result = 0;
            item.zipPath = null;
            item.imageBase64 = null;

            console.log(`⚠️ ${item.name} - 예상치 못한 결과`);
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
