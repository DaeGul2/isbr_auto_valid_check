const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// 딜레이 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 통합 함수
async function govVerify(item, delayTime, fileName) {
    const screenshotDir = `./images/${fileName}`;
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const url = "https://www.gov.kr/mw/EgovPageLink.do?link=confirm/AA040_confirm_id";
    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized"],
        defaultViewport: null,
    });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: "networkidle2" });

        // (1) 라디오 버튼 확인 및 체크
        const radioSelector = "#issue_type1";
        const isChecked = await page.$eval(radioSelector, (el) => el.checked);
        if (!isChecked) {
            await page.click(radioSelector);
            console.log("라디오 버튼 체크 완료");
        }

        // (2) passNum 파싱 및 입력
        const passParts = item.passNum.split("-").map((part) => part.replace(/^0+/, "0"));
        if (passParts.length !== 4) {
            throw new Error(`Invalid passNum format: ${item.passNum}`);
        }
        for (let i = 0; i < 4; i++) {
            await page.type(`#doc_ref_no${i + 1}`, passParts[i]);
        }

        // (3) 1차 확인 버튼 클릭
        await page.click("#btn_end");
        console.log("1차 확인 버튼 클릭");

        await delay(delayTime); // 결과창 로드 대기

        const docKeyInputSelector = "#doc_ref_key";
        const docKeyExists = await page.$(docKeyInputSelector);

        if (docKeyExists) {
            await page.type(docKeyInputSelector, item.name); // 성명 입력
            await page.click("#btn_end");
            console.log("성명 입력 및 확인 버튼 클릭");
            await delay(delayTime + 2000); // 결과 로드 대기

            const docViewSelector = 'a[onclick="javascript:view_doc();return false;"]';
            const docViewButton = await page.$(docViewSelector);
            if (docViewButton) {
                await docViewButton.click();
                console.log("문서 확인 버튼 클릭");
                await delay(delayTime + 3500);

                const pages = await browser.pages();
                const newPage = pages[pages.length - 1];

                const screenshotPath = path.join(screenshotDir, `${item.registerationNumber}_${fileName}.png`);
                await newPage.screenshot({ path: screenshotPath });
                console.log(`📸 스크린샷 저장 완료: ${screenshotPath}`);
                item.result = 1;
                return;
            }
        }

        console.log("문서 존재하지 않음");
        item.result = 0;
        item.error = '문서 없음';
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0;
        item.error = '처리중 오류';
    } finally {
        await browser.close();
    }
}

module.exports = { govVerify };
