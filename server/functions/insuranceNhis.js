const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");  // ✅ 추가: cheerio 불러오기
const { launchBrowser } = require("../utils/puppeteerHelper");

// 딜레이 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 보험 자격득실 확인 함수
async function insuranceNhis(item, delayTime) {
    const url = "https://www.nhis.or.kr/nhis/minwon/jpAeb00101.do";
    const { browser, page } = await launchBrowser();

    try {
        // (1) 페이지 열기
        await page.goto(url, { waitUntil: "networkidle2" });
        console.log("✅ 자격득실확인서 진위확인 페이지 접속 완료");

        // (2) alert 오버라이드
        await page.evaluate(() => {
            window.alert = (message) => {
                console.log("📋 감지된 alert 메시지:", message);
                window.lastAlertMessage = message;
            };
        });
        console.log("✅ alert 감지 오버라이드 설정 완료");

        // (3) 자격득실확인서 라디오 버튼 체크
        const radioSelector = "#r02";
        await page.waitForSelector(radioSelector, { visible: true });
        await page.click(radioSelector);
        console.log("✅ 자격득실확인서 체크 완료");

        // (4) 발급번호 입력
        const passNum = item.passNum.trim();
        const passNumInputSelector = "#docRefCopy";
        await page.waitForSelector(passNumInputSelector, { visible: true });
        await page.type(passNumInputSelector, passNum);
        console.log("✅ 발급번호 입력 완료:", passNum);

        // (5) 검증 버튼 클릭
        const buttonControlSelector = "#buttonControl2";
        const verifyButtonSelector = "#imgNhic";
        await page.waitForSelector(buttonControlSelector, { visible: true });
        await page.waitForFunction(
            (buttonControlSelector, verifyButtonSelector) => {
                const container = document.querySelector(buttonControlSelector);
                if (!container) return false;
                const button = container.querySelector(verifyButtonSelector);
                return button && button.offsetParent !== null;
            },
            { timeout: 60000 },
            buttonControlSelector,
            verifyButtonSelector
        );
        await page.evaluate((buttonControlSelector, verifyButtonSelector) => {
            const container = document.querySelector(buttonControlSelector);
            const button = container.querySelector(verifyButtonSelector);
            if (button) {
                button.click();
                console.log("✅ 검증 버튼 JavaScript로 클릭 완료");
            } else {
                console.error("❌ 검증 버튼을 찾을 수 없습니다.");
            }
        }, buttonControlSelector, verifyButtonSelector);
        console.log("✅ 검증 버튼 클릭 성공");

        // (6-1) 모달이 뜰 때까지 기다리기
        await page.waitForSelector('#common-ALERT-modal', { visible: true, timeout: 10000 });
        console.log("✅ common-ALERT-modal 등장 감지");

        // (7) 현재 페이지 전체 HTML 가져오기
        const htmlContent = await page.content();

        // (7-2) cheerio로 modal-dialog 블록 파싱
        const $ = cheerio.load(htmlContent);
        const parsedModalDialog = $('#common-ALERT-modal .modal-dialog').parent().html().trim();




        // (8) 모달 안의 메시지 텍스트 읽기 (추가로)
        const parsedModalMessage = $('#common-ALERT-modal #modal-message').text().trim();


        // (9) 결과 처리 및 스크린샷 저장
        if (parsedModalMessage.includes("발급받은 이력이 있습니다")) {
            item.result = 1;
            const fileName = `${item.registerationNumber}_${item.certificateName}.png`;
            item.zipPath = `건강보험자격득실확인서/${fileName}`;
            const buffer = await page.screenshot({ encoding: 'base64' });
            item.imageBase64 = buffer;

        } else if (parsedModalMessage.includes("발급받은 사실이 없습니다")) {
            item.result = 0;
        } else {
            console.log("⚠️ 예외 메시지 (특이 케이스):", parsedModalMessage);
            item.result = 0;
            item.zipPath = null;
            item.imageBase64 = null;
        }

        // (10) 모달 확인 버튼 클릭
        await page.evaluate(() => {
            const confirmButton = document.querySelector("#modal-confirm");
            if (confirmButton) {
                confirmButton.click();
            }
        });
        console.log("🖱️ 모달 확인 버튼 클릭 완료");

        // (11) 지정된 딜레이만큼 대기
        await delay(delayTime);

    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0;
        item.zipPath = null;
        item.imageBase64 = null;
    } finally {
        await browser.close();
    }
}

module.exports = { insuranceNhis };
