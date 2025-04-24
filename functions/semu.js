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

// 팝업 닫기 및 체크박스 클릭 함수
async function closePopupIfPresent(page) {
    try {
        const popupCheckboxSelector = "input[type='checkbox'][id='ckbox1']"; // '오늘 하루 열지 않기' 체크박스
        const closePopupButtonSelector = 'img[onclick="myjbpop1_temp()"]'; // 팝업 닫기 버튼
        // 추가 팝업1 닫기 (class="pop_wrap" 기반)
        const popup1CloseSelector = '.pop_wrap img[onclick="my_web_pop1_temp()"]';
        const popup1CloseBtn = await page.$(popup1CloseSelector);
        if (popup1CloseBtn) {
            console.log("추가 팝업1 닫기 버튼 클릭 중...");
            await popup1CloseBtn.click();
            await delay(1000);
            console.log("추가 팝업1 닫기 완료");
        } else {
            console.log("추가 팝업1이 감지되지 않음.");
        }

        // 추가 팝업2 닫기 (class="pop_wrap1" 기반)
        const popup2CloseSelector = '.pop_wrap1 img[onclick="my_web_pop2_temp()"]';
        const popup2CloseBtn = await page.$(popup2CloseSelector);
        if (popup2CloseBtn) {
            console.log("추가 팝업2 닫기 버튼 클릭 중...");
            await popup2CloseBtn.click();
            await delay(1000);
            console.log("추가 팝업2 닫기 완료");
        } else {
            console.log("추가 팝업2가 감지되지 않음.");
        }

        // '오늘 하루 열지 않기' 체크박스 클릭
        const checkbox = await page.$(popupCheckboxSelector);
        if (checkbox) {
            console.log("'오늘 하루 열지 않기' 체크박스 클릭 중...");
            await checkbox.click();
            await delay(500); // 클릭 후 딜레이
        } else {
            console.log("'오늘 하루 열지 않기' 체크박스가 감지되지 않음.");
        }

        // 팝업 닫기 버튼 클릭
        const popupButton = await page.$(closePopupButtonSelector);
        if (popupButton) {
            console.log("팝업 닫기 버튼 클릭 중...");
            await popupButton.click();
            await delay(1000); // 팝업 닫기 후 딜레이
            console.log("팝업 닫기 완료");
        } else {
            console.log("팝업이 감지되지 않음.");
        }
    } catch (error) {
        console.error("팝업 닫기 중 오류 발생:", error);
    }
}

// 세무사회 자격증 진위여부 확인 함수
async function semuVerify(item, delayTime, directoryName) {
    // 스크린샷 저장 디렉토리 설정
    const screenshotDir = "./images/자격증/" + directoryName;
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }



    const browser = await puppeteer.launch({
        headless: false,
        args: [
            "--start-maximized", // 창 최대화
            "--disable-blink-features=AutomationControlled", // 자동화 감지 방지
        ],
        defaultViewport: null,
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

    const verifyUrl = "https://license.kacpta.or.kr/web/issue/license_auth.aspx";
    await page.goto(verifyUrl, { waitUntil: "networkidle2" });

    // 팝업 닫기 및 체크박스 설정
    await closePopupIfPresent(page);

    console.log("세무사회 자격증 진위 확인 페이지로 이동");

    try {
        console.log("현재 처리 중인 데이터:", item);

        // 이름과 자격번호 입력
        const name = String(item.name || "").trim();
        const passNum = String(item.passNum || "").trim();

        // 자격번호 길이 검증
        if (passNum.length < 10 || passNum.length > 12) {
            item.result = 0; // 실패 상태 설정
            item.error = "유효하지 않은 번호 : 10~12글자 여야 함"; // 에러 메시지 설정
            console.log(`처리 중단 - ${item.name}: ${item.error}`); // 디버깅 메시지
            return; // 함수 종료
        }

        if (!name || !passNum) {
            throw new Error("이름 또는 자격번호가 비어 있습니다.");
        }

        await page.type("input[name='sname']", name); // 이름 입력
        await page.type("input[name='snum']", passNum); // 자격번호 입력

        // 진위 확인 버튼 클릭
        const verifyButtonSelector = 'button[onclick="do_submit()"]';
        const verifyButton = await page.$(verifyButtonSelector);
        if (!verifyButton) {
            throw new Error(`진위 확인 버튼을 찾을 수 없습니다. Selector: ${verifyButtonSelector}`);
        }
        await verifyButton.click();
        console.log("진위 확인 버튼 클릭 완료");

        // 알림창 대기 및 처리
        page.on("dialog", async (dialog) => {
            console.log(`Alert 발생: ${dialog.message()}`);



            item.result = 0;
            item.error = "유효하지 않은 자격번호";

            await dialog.accept(); // Alert 확인 버튼 클릭
            console.log("Alert 확인 버튼 클릭 완료");
        });

        // 결과 로드 대기
        await delay(delayTime);


        // 결과 확인 및 처리
        const result = await page.evaluate(() => {
            const successRow = document.querySelector("tbody tr:nth-child(2)");
            if (successRow) {
                const cells = Array.from(successRow.querySelectorAll("td"));
                return {
                    isValid: true,
                    data: {
                        종목: cells[3]?.textContent.trim(),
                        합격일자: cells[4]?.textContent.trim(),
                        일치여부: cells[2]?.textContent.trim(),
                    },
                };
            }
            return {
                isValid: false,
                errorMessage: "결과를 찾을 수 없습니다.",
            };
        });

        if (result?.isValid && result.data.일치여부 === "일치") {
            const { 종목, 합격일자 } = result.data;
            item.subs = 종목;
            item.date = 합격일자;
            item.result = 1;
            // 페이지 전체 스크린샷 저장
            // const resultScreenshotPath = path.join(screenshotDir,`${item.name}_semu_full_result.png`);
            const resultScreenshotPath = getResultScreenshotPath(screenshotDir, item);
            await page.screenshot({ path: resultScreenshotPath, fullPage: true });
            console.log(`전체 페이지 스크린샷 저장: ${resultScreenshotPath}`);

            console.log(
                `${item.name}, 진위 여부 : 성공\n종목 : ${종목}, 합격일자 : ${합격일자}`
            );
        } else if (result?.data?.일치여부 === "불일치") {
            item.result = "자격번호 불일치";
            console.log(`${item.name}, 자격번호 불일치`);
        } else {
            item.subs = "";
            item.date = "";
            item.result = "유효하지 않은 번호";
            item.error = result.errorMessage;
            console.log(`${item.name}, 진위 확인 실패: ${item.error}`);
        }

        await delay(delayTime);
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = "처리 실패";
        item.error = error.message;
    } finally {
        await browser.close();
    }
}

module.exports = { semuVerify };
