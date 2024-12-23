const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const fs = require("fs");
const { getResultScreenshotPath } = require('./utils'); // 유틸리티 함수 import

// Puppeteer Stealth 플러그인 활성화
puppeteer.use(StealthPlugin());

// 스크린샷 디렉토리 생성
const screenshotDir = "./images/자격증";
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir); // 디렉토리가 없으면 생성
}

// 지정된 시간만큼 딜레이를 추가하는 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 한국데이터산업진흥원 진위여부 확인 함수
async function dataSaneopVerify(item, delayTime) {
    const browser = await puppeteer.launch({
        headless: false, // 브라우저 표시
        args: [
            "--start-maximized", // 창 최대화
            "--disable-blink-features=AutomationControlled", // 자동화 감지 방지
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
        ],
        defaultViewport: null, // 기본 뷰포트 비활성화
    });

    const page = await browser.newPage();

    // 탐지 방지를 위한 설정
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "en-US"] });
    });

    // HTTP 헤더 추가
    await page.setExtraHTTPHeaders({
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    try {
        // 페이지 요청 가로채기 활성화
        await page.setRequestInterception(true); // **요청 인터셉션 활성화**

        page.on("request", (request) => {
            // 초기 HTML 요청만 허용, 다른 모든 요청 차단
            if (request.resourceType() === "document") {
                request.continue(); // HTML 문서 요청은 통과
            } else {
                request.abort(); // 나머지 요청 차단
            }
        });

        // 1. 진위 확인 페이지로 이동
        const verifyUrl = "https://www.dataq.or.kr/www/anno/cert/check.do";
        await page.goto(verifyUrl, { waitUntil: "domcontentloaded" });
        console.log("페이지 로드 완료, 추가 요청 차단 중");

        // 페이지 로드 후 요청 차단 해제
        await page.setRequestInterception(false); // **필요 시 인터셉션 해제**

        // 자격번호 파싱
        const [firstNum, secondNum] = item.passNum.split("-");
        if (!firstNum || !secondNum) {
            throw new Error("자격번호 형식이 올바르지 않습니다. (올바른 형식: xxxx-xxxxxxxx)");
        }

        // 지원자 정보 입력
        await page.select("#class1", firstNum); // 종목 선택
        await page.type("#certno", secondNum); // 자격번호 뒷자리 입력
        await page.type("#name", item.name); // 성명 입력

        // 조회기관 정보 입력
        await page.type("#reqOrg", "인사바른");
        await page.type("#reqUser", "민태희");
        await page.type("#reqTel", "01064400583");
        await page.click("#reqPurps_01"); // 채용증빙 선택

        // 조회 버튼 클릭
        await page.click("#btnConfirm");
        await delay(delayTime); // 결과 로드 대기

        // 결과 스크린샷 저장
        // const resultScreenshotPath = path.join(screenshotDir, `${item.name}_dataSaneop_result.png`);
        const resultScreenshotPath = getResultScreenshotPath(screenshotDir, item);
        await page.screenshot({ path: resultScreenshotPath });
        
        console.log(`결과 페이지 스크린샷 저장: ${resultScreenshotPath}`);

        // 결과 파싱
        const result = await page.evaluate(() => {
            const tbody = document.querySelector("tbody");
            if (!tbody) return null;

            const noDataText = tbody.querySelector("td.no_b_right")?.textContent.trim();
            if (noDataText?.includes("일치하는 인증서 정보가 없습니다")) {
                return { isValid: false, data: null };
            }

            const rows = Array.from(tbody.querySelectorAll("tr"));
            const data = {};
            rows.forEach((row) => {
                const key = row.querySelector("th")?.textContent.trim();
                const value = row.querySelector("td")?.textContent.trim();
                if (key && value) {
                    data[key] = value;
                }
            });

            return {
                isValid: true,
                data: {
                    종목: data["종목"],
                    합격일자: data["합격일자"],
                },
            };
        });

        // 결과 처리
        if (result?.isValid) {
            const { 종목, 합격일자 } = result.data;
            item.subs = 종목; // 종목 저장
            item.date = 합격일자; // 합격일자 저장
            item.result = 1; // 성공
            console.log(`${item.name}, 합격 여부 : 성공\n종목 : ${종목}, 합격일자 : ${합격일자}`);
        } else {
            item.subs = ""; // 종목 없음
            item.date = ""; // 합격일자 없음
            item.result = 0; // 실패
            console.log(`${item.name}, 진위 확인 실패`);
        }

        await delay(delayTime);
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0; // 실패로 처리
    } finally {
        await browser.close();
    }
}

module.exports = { dataSaneopVerify };
