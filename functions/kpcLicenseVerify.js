const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const fs = require("fs");
const { getResultScreenshotPath } = require('./utils'); // 유틸리티 함수 import



// Puppeteer Stealth 플러그인 활성화
puppeteer.use(StealthPlugin());

// 생년월일 처리 함수
function parseBirth(birth) {
    if (!birth) {
        throw new Error("생년월일 데이터가 없습니다.");
    }

    // 1. 생년월일을 문자열로 변환하고 숫자만 추출
    const rawBirth = String(birth).replace(/[^0-9]/g, ""); // 숫자만 남김

    // 2. 길이에 따라 형식 처리
    if (rawBirth.length === 6) {
        // yy.mm.dd 또는 yymmdd
        const year = parseInt(rawBirth.slice(0, 2));
        const birthPrefix = year >= 50 ? "19" : "20"; // 50~99는 1900년대, 나머지는 2000년대
        return `${birthPrefix}${rawBirth}`;
    } else if (rawBirth.length === 8) {
        // yyyy.mm.dd 또는 yyyymmdd
        return rawBirth; // 이미 yyyymmdd 형식
    } else {
        throw new Error(`생년월일 형식이 올바르지 않습니다: ${birth}`);
    }
}



// 지정된 시간만큼 딜레이를 추가하는 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 한국생산성본부 진위확인 함수
async function kpcLicenseVerify(item, delayTime,directoryName) {
    // 스크린샷 디렉토리 생성
    const screenshotDir = "./images/자격증/" + directoryName;
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir); // 디렉토리가 없으면 생성
    }
    const browser = await puppeteer.launch({
        headless: false, // 브라우저 표시
        args: [
            "--start-maximized", // 창 최대화
            "--disable-blink-features=AutomationControlled", // 자동화 감지 방지
        ],
        defaultViewport: null, // 기본 뷰포트 비활성화
    });

    const page = await browser.newPage();

    // `navigator.webdriver` 감추기
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
            get: () => false,
        });
    });

    // User-Agent 설정
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // 한국생산성본부 진위 확인 페이지로 이동
    const verifyUrl = "https://license.kpc.or.kr/nasec/psexamcrqfccnfirm/crqfreqst/selectQualftruflscnfirm.do";
    await page.goto(verifyUrl, { waitUntil: "networkidle2" });

    console.log("한국생산성본부 진위 확인 페이지로 이동");

    try {
        // 생년월일 파싱
        const formattedBirth = parseBirth(item.birth); // 다양한 형식의 birth를 처리하여 yyyymmdd로 변환
        console.log("생년월일 : ", formattedBirth);
        // 자격번호 파싱
        const licenseCode = item.passNum.replace(/-/g, ""); // '-' 제거

        // 1. 입력값 비우기
        await page.evaluate(() => {
            document.querySelector("#userKName").value = ""; // 이름 필드 비우기
            document.querySelector("#ipinBirth").value = ""; // 생년월일 필드 비우기
            document.querySelector("#licenseCode").value = ""; // 자격번호 필드 비우기
        });

        // 2. 입력값 채우기
        await page.type("#userKName", item.name); // 이름 입력
        await page.type("#ipinBirth", formattedBirth); // 생년월일 입력
        await page.type("#licenseCode", licenseCode); // 자격번호 입력

        // 진위 확인 버튼 클릭
        await page.click("button.btn.btn_xl.col-12-s.bg_red.text_color_white"); // 진위 확인 버튼 클릭
        await delay(delayTime); // 결과 로드 대기

        // 스크린샷 저장
        const resultScreenshotPath = getResultScreenshotPath(screenshotDir, item);
        await page.screenshot({ path: resultScreenshotPath });
        console.log(`결과 페이지 스크린샷 저장: ${resultScreenshotPath}`);

        // 결과 확인 및 처리
        const result = await page.evaluate(() => {
            const successTable = document.querySelector("div.table-add");
            const failureMessage = document.querySelector("div.article.content_panel.option-row dl.text_info_list01 dt");

            if (failureMessage?.textContent.includes("입력내용과 일치하는 자료가 없습니다")) {
                return { isValid: false, data: null };
            }

            if (successTable) {
                const rows = Array.from(successTable.querySelectorAll("tbody tr"));
                const data = {};
                rows.forEach((row) => {
                    const key = row.querySelector("th span")?.textContent.trim();
                    const value = row.querySelector("td")?.textContent.trim();
                    if (key && value) {
                        data[key] = value;
                    }
                });
                return {
                    isValid: true,
                    data: {
                        자격종목: data["자격종목"],
                    },
                };
            }

            return { isValid: false, data: null }; // 기본값
        });

        // 결과 처리
        if (result?.isValid) {
            const { 자격종목 } = result.data;
            item.subs = 자격종목; // 자격종목 저장
            item.result = 1; // 성공
            console.log(`${item.name}, 합격 여부 : 성공\n자격종목 : ${자격종목}`);
        } else {
            item.subs = ""; // 자격종목 없음
            item.result = 0; // 실패
            console.log(`${item.name}, 진위 확인 실패`);
        }

        // 딜레이 추가
        await delay(delayTime);
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0; // 실패로 처리
    } finally {
        await browser.close();
    }
}

module.exports = { kpcLicenseVerify };
