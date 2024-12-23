const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// 스크린샷 저장 디렉토리
const screenshotDir = "./images/건강보험득실확인서";
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
}

// 딜레이 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 보험 자격득실 확인 함수
async function insuranceGov(item, delayTime) {
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

        // (2) passNum 파싱 및 입력 (숫자로 변환 및 보정)
        const passParts = item.passNum.split("-").map((part) => {
            return part.replace(/^0+/, "0"); // '0530'처럼 맨 앞에 0 유지
        });

        if (passParts.length !== 4) {
            throw new Error(`Invalid passNum format: ${item.passNum}`);
        }

        for (let i = 0; i < 4; i++) {
            await page.type(`#doc_ref_no${i + 1}`, passParts[i]);
        }

        // (3) 1차 확인 버튼 클릭
        await page.click("#btn_end");
        console.log("1차 확인 버튼 클릭");
        
        await delay(delayTime); // 결과창이 뜰 때까지 대기

        const docKeyInputSelector = "#doc_ref_key";
        const docKeyExists = await page.$(docKeyInputSelector);

        if (docKeyExists) {
            // 문서 존재 시 추가 입력
            await page.type(docKeyInputSelector, item.name); // 성명 입력
            await page.click("#btn_end");
            console.log("성명 입력 및 확인 버튼 클릭");
            await delay(delayTime + 2000); // 결과 로드 대기

            const docViewSelector = 'a[onclick="javascript:view_doc();return false;"]';
            const docViewButton = await page.$(docViewSelector);
            if (docViewButton) {
                await docViewButton.click();
                console.log("문서 확인 버튼 클릭");
                await delay(delayTime + 3500); // 결과창 로드 대기

                const pages = await browser.pages();
                const newPage = pages[pages.length - 1];

                // 양쪽으로 정렬한 후 전체 화면 스크린샷 저장
                const screenshotPath = path.join(
                    screenshotDir,
                    `${item.registerationNumber}_combined_fullscreen_${Date.now()}.png`
                );

                console.log("결과창 로드 완료, 화면 양분 시작");

                // 기존 입력 페이지와 결과 페이지를 양쪽으로 정렬
                await page.evaluate(() => {
                    document.body.style.display = "flex";
                    document.body.style.flexDirection = "row";
                    document.body.style.justifyContent = "space-between";
                });

                await newPage.evaluate(() => {
                    document.body.style.display = "flex";
                    document.body.style.flexDirection = "row";
                    document.body.style.justifyContent = "space-between";
                });

                // 전체 화면 스크린샷
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`📸 전체 화면 스크린샷 저장 완료: ${screenshotPath}`);
                item.result = 1;
                return;
            }
        }

        // (3-2) 문서 존재하지 않음
        const noDocSelector = ".pop_txt_20";
        const noDocPopup = await page.$eval(noDocSelector, (el) => el.textContent.trim());
        if (noDocPopup.includes("해당 문서가 존재하지 않습니다.")) {
            const screenshotPath = path.join(screenshotDir, `${item.name}_no_doc.png`);
            await page.screenshot({ path: screenshotPath });
            console.log(`문서 없음 팝업 스크린샷 저장: ${screenshotPath}`);
            item.result = "문서존재하지않음";
            return;
        }

        // (3-3) 열람기간 지남
        if (noDocPopup.includes("열람기간이 지난 문서입니다.")) {
            const screenshotPath = path.join(screenshotDir, `${item.name}_expired_doc.png`);
            await page.screenshot({ path: screenshotPath });
            console.log(`열람 기간 만료 팝업 스크린샷 저장: ${screenshotPath}`);
            item.result = "열람기간 지남";
            return;
        }
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = "처리 실패";
    } finally {
        await browser.close();
    }
}

module.exports = { insuranceGov };
