const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp"); // 이미지 결합용 라이브러리

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

    // ✅ 사람별 temp 폴더 생성
    const tempDir = `./images/temp/${item.registerationNumber}`;
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
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
            // 이름 입력 필드가 보이도록 스크롤
            await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, docKeyInputSelector);

            await delay(1500); // 스크롤 이동 후 대기

            await page.type(docKeyInputSelector, item.name); // 성명 입력
            await page.click("#btn_end");
            console.log("성명 입력 및 확인 버튼 클릭");

            // temp1 사진 촬영
            const temp1Path = path.join(tempDir, "temp1.png");
            await page.screenshot({ path: temp1Path });
            console.log(`📸 temp1 스크린샷 저장 완료: ${temp1Path}`);

            await delay(delayTime + 2000); // 결과 로드 대기

            const docViewSelector = 'a[onclick="javascript:view_doc();return false;"]';
            const docViewButton = await page.$(docViewSelector);
            if (docViewButton) {
                await docViewButton.click();
                console.log("문서 확인 버튼 클릭");
                await delay(delayTime + 3500);

                const pages = await browser.pages();
                const newPage = pages[pages.length - 1];
                await delay(delayTime);

                // temp2 사진 촬영
                const temp2Path = path.join(tempDir, "temp2.png");
                await newPage.screenshot({ path: temp2Path });
                console.log(`📸 temp2 스크린샷 저장 완료: ${temp2Path}`);

                // 최종 이미지 저장 경로
                const screenshotPath = path.join(
                    screenshotDir,
                    `${item.registerationNumber}_${fileName}.png`
                );

                // 이미지 병합
                const temp1Meta = await sharp(temp1Path).metadata();
                const temp2Meta = await sharp(temp2Path).metadata();

                const totalWidth = temp1Meta.width + temp2Meta.width;
                const maxHeight = Math.max(temp1Meta.height, temp2Meta.height);

                await sharp({
                    create: {
                        width: totalWidth,
                        height: maxHeight,
                        channels: 3,
                        background: { r: 255, g: 255, b: 255 },
                    },
                })
                    .composite([
                        { input: temp1Path, left: 0, top: 0 },
                        { input: temp2Path, left: temp1Meta.width, top: 0 },
                    ])
                    .toFile(screenshotPath);

                console.log(`📸 합쳐진 스크린샷 저장 완료: ${screenshotPath}`);

                item.result = 1;

                // temp 이미지 삭제
                fs.unlinkSync(temp1Path);
                fs.unlinkSync(temp2Path);
                console.log("📂 temp 파일 삭제 완료");

                return;
            }
        }

        console.log("문서 존재하지 않음");
        item.result = 0;
        item.error = "문서 없음";
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0;
        item.error = "처리중 오류";
    } finally {
        await browser.close();

        // 사람별 temp 폴더 삭제
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(`📂 temp 디렉토리 삭제 완료: ${tempDir}`);
        }
    }
}

module.exports = { govVerify };
