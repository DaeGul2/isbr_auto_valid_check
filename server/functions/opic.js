const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const fs = require("fs");
const { getResultScreenshotPath } = require('./utils'); // 유틸리티 함수 import

// Puppeteer Stealth 플러그인 활성화
puppeteer.use(StealthPlugin());


// 지정된 시간만큼 딜레이를 추가하는 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// OPIc 진위여부 확인 함수
async function opicVerify(item, delayTime) {
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

    // OPIc 진위 확인 페이지로 이동
    const verifyUrl =
        "https://www.opic.or.kr/opics/servlet/controller.opic.site.certi.CertiServlet?p_process=select-certicontrast";
    await page.goto(verifyUrl, { waitUntil: "networkidle2" });

    console.log("OPIc 진위 확인 페이지로 이동");

    try {
        // 인증서 번호 파싱
        const certParts = item.passNum.split("-");
        if (certParts.length !== 5) {
            throw new Error("인증서 번호 형식이 올바르지 않습니다. (올바른 형식: xxxx-xxxx-xxxx-xxxx-xxxx)");
        }

        // 입력값 비우기 및 입력값 채우기
        const inputs = await page.$$(".inp"); // 모든 .inp 요소 선택
        if (inputs.length !== 5) {
            throw new Error(`인증서 번호 입력 필드를 찾을 수 없습니다. 찾은 필드 수: ${inputs.length}`);
        }

        for (let i = 0; i < certParts.length; i++) {
            await inputs[i].click({ clickCount: 3 }); // 입력 필드 비우기
            await inputs[i].type(certParts[i]); // 값 입력
        }

        // 확인 버튼 클릭
        // (1) 확인 버튼 클릭
        await page.click("button.btn.md.secondary02");
        console.log("확인 버튼 클릭 완료");

        // (2) 결과 로드 대기
        await delay(delayTime);

        // (3) 스크린샷 경로 및 zipPath 설정
        const fileName = `${item.registerationNumber}_${item.name}_${item.certificateName}.png`;
        item.zipPath = `자격증/OPIc/${fileName}`;
        const buffer = await page.screenshot({ fullPage: true, encoding: 'base64' });
        item.imageBase64 = buffer;

        // (4) 결과 파싱
        const result = await page.evaluate(() => {
            const successRow = document.querySelector("tr");
            const failureMessage = document.querySelector("div.layerpopInbox .ltxt");

            if (failureMessage?.textContent.includes("인증서 번호를 다시 확인해 주세요")) {
                return {
                    isValid: false,
                    errorMessage: failureMessage.textContent.trim(),
                };
            }

            if (successRow) {
                const rows = Array.from(successRow.querySelectorAll("td span.tdcell"));
                const data = {
                    등급: rows[5]?.textContent.split("<br>")[0].trim(), // 등급
                    발급일: rows[6]?.textContent.trim(), // 발급일
                };
                return {
                    isValid: true,
                    data,
                };
            }

            return {
                isValid: false,
                errorMessage: "결과를 찾을 수 없습니다.",
            };
        });

        // (5) 결과 처리
        if (result?.isValid) {
            const { 등급, 발급일 } = result.data;
            item.subs = 등급;
            item.date = 발급일;
            item.result = 1;
        } else {
            item.subs = "";
            item.date = "";
            item.result = 0;
            item.imageBase64 = null;
            item.zipPath = null;
            item.error = result.errorMessage;
            console.log(`${item.name}, 진위 확인 실패: ${item.error}`);
        }

        // 결과 처리
        if (result?.isValid) {
            const { 등급, 발급일 } = result.data;
            item.subs = 등급; // 등급 저장
            item.date = 발급일; // 발급일 저장
            item.result = 1; // 성공
            console.log(`${item.name}, 합격 여부 : 성공\n등급 : ${등급}, 발급일 : ${발급일}`);
        } else {
            item.subs = ""; // 데이터 없음
            item.date = ""; // 발급일 없음
            item.result = 0;
            item.zipPath = null;
            item.imageBase64 = null;

            item.error = result.errorMessage; // 에러 메시지 저장
            console.log(`${item.name}, 진위 확인 실패: ${item.error}`);
        }

        // 실패 시 확인 버튼 클릭
        if (!result?.isValid) {
            await page.click("div.layerpopFoot .btn.secondary.lg"); // 확인 버튼 클릭
            await delay(delayTime);
        }

        // 딜레이 추가
        await delay(delayTime);
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0;
        item.zipPath = null;
        item.imageBase64 = null;
        item.error = error.message; // 에러 메시지 저장
    } finally {
        await browser.close();
    }
}

module.exports = { opicVerify };
