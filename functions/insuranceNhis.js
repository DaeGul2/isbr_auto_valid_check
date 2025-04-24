const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// 스크린샷 저장 디렉토리
const screenshotDir = "./images/건강보험자격득실확인서";
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
}

// 딜레이 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 보험 자격득실 확인 함수
async function insuranceNhis(item, delayTime) {
    const url = "https://www.nhis.or.kr/nhis/minwon/jpAeb00101.do";
    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized"],
        defaultViewport: null,
    });
    const page = await browser.newPage();

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

        // (3) 자격득실확인서 체크
        const radioSelector = "#r02";
        await page.waitForSelector(radioSelector, { visible: true });
        await page.click(radioSelector);
        console.log("✅ 자격득실확인서 체크 완료");

        // (4) 발급번호 입력
        const passNum = item.passNum.trim();
        const passNumInputSelector = "#docRefCopy";
        await page.waitForSelector(passNumInputSelector, { visible: true });
        await page.type(passNumInputSelector, passNum);
        console.log("✅ 발급번호 입력 완료: ", passNum);

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

        // 버튼 클릭
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

        await page.waitForSelector('.modal-dialog', { visible: true, timeout: 10000 });

        const modalText = await page.evaluate(() => {
            const modalDivs = Array.from(document.querySelectorAll("div.modal-dialog .modal-content .modal-conts .conts-area"));
            if (modalDivs.length === 0) return null;
            return modalDivs[0].textContent.trim();
        });
        
        if (modalText) {
            console.log("📋 모달 텍스트 감지:", modalText);
        
            if (modalText.includes("발급받은 이력이 있습니다")) {
                item.result = 1;
        
                // ✅ 스크린샷 저장
                const screenshotPath = path.join(
                    screenshotDir,
                    `${item.registerationNumber}_건보자격득실확인서_건보홈페이지.png`
                );
                await page.screenshot({ path: screenshotPath });
                console.log("📸 스크린샷 저장 완료:", screenshotPath);
            } else if (modalText.includes("발급받은 사실이 없습니다")) {
                item.result = 0;
            } else {
                console.log("⚠️ 예외 메시지:", modalText);
                item.result = 0;
            }
        
            // 확인 버튼 누르기
            const confirmBtn = await page.$("#modal-confirm");
            if (confirmBtn) await confirmBtn.click();
            console.log("🖱️ 확인 버튼 클릭 완료");
        } else {
            console.log("❌ 모달 텍스트를 찾지 못했음");
            item.result = 0;
        }
        

        await delay(delayTime);
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0; // 처리 실패
    } finally {
        await browser.close();
    }
}

module.exports = { insuranceNhis };
