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

        // (6) alert 메시지 확인 및 스크린샷 저장
        await delay(2000); // 2초 대기
        const alertMessage = await page.evaluate(() => {
            return window.lastAlertMessage || null;
        });

        if (alertMessage) {
            console.log(`📋 감지된 alert 메시지: ${alertMessage}`);

            // alert 메시지를 화면 중앙에 띄우기 위해 DOM에 삽입 (UI 개선)
            await page.evaluate((message) => {
                const alertOverlay = document.createElement("div");
                alertOverlay.style.position = "fixed";
                alertOverlay.style.top = "50%";
                alertOverlay.style.left = "50%";
                alertOverlay.style.transform = "translate(-50%, -50%)";
                alertOverlay.style.background = "white";
                alertOverlay.style.padding = "30px";
                alertOverlay.style.border = "1px solid #ccc";
                alertOverlay.style.borderRadius = "10px";
                alertOverlay.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
                alertOverlay.style.zIndex = 9999;
                alertOverlay.style.fontSize = "16px";
                alertOverlay.style.color = "#333";
                alertOverlay.style.textAlign = "left";

                // 제목
                const title = document.createElement("div");
                title.style.fontSize = "18px";
                title.style.fontWeight = "bold";
                title.style.marginBottom = "10px";
                title.textContent = "www.nhis.or.kr 내용:";
                alertOverlay.appendChild(title);

                // 메시지
                const content = document.createElement("div");
                content.textContent = message;
                alertOverlay.appendChild(content);

                // 확인 버튼
                const button = document.createElement("button");
                button.textContent = "확인";
                button.style.marginTop = "20px";
                button.style.padding = "10px 20px";
                button.style.border = "none";
                button.style.borderRadius = "5px";
                button.style.background = "#007bff";
                button.style.color = "white";
                button.style.cursor = "pointer";
                button.style.fontSize = "14px";
                button.onclick = () => {
                    alertOverlay.remove();
                };
                alertOverlay.appendChild(button);

                document.body.appendChild(alertOverlay);
            }, alertMessage);

            // 스크린샷 저장
            const screenshotPath = path.join(
                screenshotDir,
                `${item.registerationNumber}_건보자격득실확인서_건보홈페이지.png`
            );
            await page.screenshot({ path: screenshotPath });
            console.log(`📸 alert 스크린샷 저장 완료: ${screenshotPath}`);

            // 메시지에 따라 결과 처리
            if (alertMessage.includes("발급받은 이력이 있습니다")) {
                console.log("✅ 발급 이력 있음");
                item.result = 1; // 성공
            } else if (alertMessage.includes("조회된 내역이 없습니다")) {
                console.log("❌ 발급 이력 없음");
                item.result = 0; // 실패
            } else if (alertMessage.includes("조회 중 오류가 발생하였습니다")) {
                console.log("⚠️ 조회 중 오류 발생");
                item.result = 0; // 실패
            } else {
                console.log("⚠️ 알 수 없는 alert 메시지");
                item.result = 0; // 기본 실패 처리
            }
        } else {
            console.log("❌ alert 메시지를 감지하지 못했습니다.");
            item.result = 0; // 실패
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
