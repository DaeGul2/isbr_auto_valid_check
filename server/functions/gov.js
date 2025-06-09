const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { launchBrowser } = require("../utils/puppeteerHelper");

async function govVerify(item, delayTime, fileName) {
    const { browser, page } = await launchBrowser();
    const tempDir = `./images/temp/${item.registerationNumber}`;
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const url = "https://www.gov.kr/mw/EgovPageLink.do?link=confirm/AA040_confirm_id";

    try {
        // ① 페이지 접속 및 option_box 대기
        await page.goto(url, { waitUntil: "networkidle2" });
        await page.waitForSelector('.option_box', { timeout: 10000 });

        // ② 라디오 버튼 선택
        const radioSelector = "#issue_type1";
        const isChecked = await page.$eval(radioSelector, el => el.checked);
        if (!isChecked) await page.click(radioSelector);

        // ③ 문서확인번호 입력
        const passParts = item.passNum.split("-").map(p => p.replace(/^0+/, "0"));
        if (passParts.length !== 4) throw new Error(`Invalid passNum format: ${item.passNum}`);
        for (let i = 0; i < 4; i++) {
            await page.type(`#doc_ref_no${i + 1}`, passParts[i]);
        }

        // ④ 1차 확인 버튼 클릭
        await page.waitForSelector("#btn_end", { timeout: 10000 });
        await page.click("#btn_end");

        // ⑤ 실패 팝업 여부 판단
        const failPopup = await page.waitForSelector('#mw_pop_01[style*="block"]', { timeout: delayTime }).catch(() => null);
        if (failPopup) {
            item.result = 0;
            item.error = "문서 없음";
            item.zipPath = null;
            item.imageBase64 = null;
            return;
        }

        // ⑥ 성명 입력창 등장 확인
        await page.waitForSelector('input[name="doc_ref_key_element"]', { timeout: 10000 });

        // ⑦ 성명 입력 및 재확인 클릭
        await page.type('#doc_ref_key', item.name);
        await page.waitForSelector("#btn_end", { timeout: 10000 });
        await page.click("#btn_end");

        // ⑧ form#form1 등장 대기 → temp1 스크린샷
        await page.waitForSelector('form#form1', { timeout: 10000 });
        const temp1Path = path.join(tempDir, "temp1.png");
        await page.screenshot({ path: temp1Path });
        console.log(`📸 temp1 저장: ${temp1Path}`);

        // ⑨ 문서확인 버튼 클릭
        // ⑩ 문서확인 버튼 클릭 → 새 탭 열림 대기
        const viewButton = await page.waitForSelector('a[onclick*="view_doc"]', { timeout: 10000 });
        await viewButton.click();

        // 새 탭 열릴 시간 대기
        await new Promise(resolve => setTimeout(resolve, 3000));
        const pages = await browser.pages();
        const newPage = pages[pages.length - 1];
        await newPage.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 });

        // ✅ iframe 접근 및 내부 로딩 완료 대기
        await newPage.waitForSelector('#viewerFrame', { timeout: 20000 });
        const frameHandle = await newPage.$('#viewerFrame');
        const frame = await frameHandle.contentFrame();

        // iframe 내부의 실제 PDF 렌더링 요소 기다리기
        await frame.waitForSelector('.page', { timeout: 15000 });
        await frame.waitForSelector('.textLayer', { timeout: 15000 });

        // ✅ iframe 내부 HTML 저장 (디버깅용)
        const content = await frame.content();
        fs.writeFileSync(`./iframe_debug_${item.registerationNumber}.txt`, content, { encoding: 'utf-8' });

        // ⑪ temp2 스크린샷
        const temp2Path = path.join(tempDir, "temp2.png");
        await newPage.screenshot({ path: temp2Path });
        console.log(`📸 temp2 저장: ${temp2Path}`);

        // ⑫ 이미지 병합 및 결과 저장
        const temp1Meta = await sharp(temp1Path).metadata();
        const temp2Meta = await sharp(temp2Path).metadata();
        const totalWidth = temp1Meta.width + temp2Meta.width;
        const maxHeight = Math.max(temp1Meta.height, temp2Meta.height);
        const imageBuffer = await sharp({
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
            .png()
            .toBuffer();

        const finalFileName = `${item.registerationNumber}_${fileName}.png`;
        item.zipPath = `${fileName}/${finalFileName}`;
        item.imageBase64 = imageBuffer.toString("base64");
        item.result = 1;

        // temp 삭제
        fs.unlinkSync(temp1Path);
        fs.unlinkSync(temp2Path);
        console.log("📂 temp 이미지 삭제 완료");
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0;
        item.error = "처리중 오류";
        item.zipPath = null;
        item.imageBase64 = null;
    } finally {
        await browser.close();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(`📂 temp 폴더 삭제 완료: ${tempDir}`);
        }
    }
}

module.exports = { govVerify };
