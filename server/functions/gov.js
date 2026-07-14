const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { launchBrowser, safeBrowserClose } = require("../utils/puppeteerHelper");

async function govVerify(item, delayTime, fileName, certificateName) {
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
        const rawPassNum = String(item.passNum ?? "").replace(/\s/g, "");
        const passParts = rawPassNum.split("-");
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

        // ⑧ 결과 페이지 등장 대기 → temp1 스크린샷
        // 발급기관에 따라 결과 페이지 form 구조가 다르므로(등본/초본은 form#form1,
        // 건강보험자격득실확인서는 다른 구조) "문서확인" 버튼이 등장하는 것을 기준으로 대기.
        await page.waitForFunction(
            () => {
                const els = document.querySelectorAll("button, a, input[type='button']");
                return Array.from(els).some((el) => {
                    if (el.offsetParent === null) return false;
                    const t = (el.innerText || el.value || "").trim();
                    return t === "문서확인";
                });
            },
            { timeout: 15000 }
        );
        const temp1Path = path.join(tempDir, "temp1.png");
        await page.screenshot({ path: temp1Path });
        console.log(`📸 temp1 저장: ${temp1Path}`);

        // ⑨ 문서확인 버튼 클릭 → 새 탭 열림 대기
        // a[onclick*="view_doc"] 셀렉터는 발급기관에 따라 존재하지 않을 수 있어
        // 텍스트 매칭으로 클릭. (등본/초본/건강보험 모두 버튼 텍스트가 "문서확인")
        const clickResult = await page.evaluate(() => {
            const candidates = Array.from(
                document.querySelectorAll("button, a, input[type='button']")
            );
            const target = candidates.find((el) => {
                if (el.offsetParent === null) return false;
                const t = (el.innerText || el.value || "").trim();
                return t === "문서확인";
            });
            if (target) {
                target.click();
                return true;
            }
            return false;
        });
        if (!clickResult) {
            throw new Error("문서확인 버튼을 찾을 수 없습니다.");
        }

        // 새 탭 열릴 시간 대기
        await new Promise(resolve => setTimeout(resolve, 3000));
        const pages = await browser.pages();
        const newPage = pages[pages.length - 1];
        await newPage.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 });

        // ✅ iframe 접근 및 내부 로딩 완료 대기
        await newPage.waitForSelector('#viewerFrame', { timeout: 40000 });
        const frameHandle = await newPage.$('#viewerFrame');
        const frame = await frameHandle.contentFrame();

        // iframe 내부의 실제 PDF 렌더링 요소 기다리기
        await frame.waitForSelector('.page', { timeout: 15000 });
        await frame.waitForSelector('.textLayer', { timeout: 15000 });

        // ✅ iframe 내부 HTML 저장 (디버깅용)
        const content = await frame.content();
        // fs.writeFileSync(`./iframe_debug_${item.registerationNumber}.txt`, content, { encoding: 'utf-8' });

        // 🔽🔽🔽 여기부터 추가: 두 번째 스샷 전에 viewport 축소 🔽🔽🔽
        const currentViewport = newPage.viewport(); // 필요하면 나중에 되돌릴 수 있음 (지금은 안 씀)

        // 예시: 가로·세로를 좀 더 작은 값으로 설정
        await newPage.setViewport({
            width: 1200,   // 너비 줄이고
            height: 1000    // 높이는 적당히
        });

        // ⑪ temp2 스크린샷
        const temp2Path = path.join(tempDir, "temp2.png");
        await newPage.screenshot({ path: temp2Path, fullPage: true });
        console.log(`📸 temp2 저장: ${temp2Path}`);
        // 🔼🔼🔼 여기까지가 뷰포트 축소 + 두 번째 스샷 부분 🔼🔼🔼

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

        // 파일명 통일 규칙: 수험번호_이름_자격증명 (자격증명 없으면 기관명 fallback)
        const certLabel = certificateName && String(certificateName).trim() ? String(certificateName).trim() : fileName;
        const finalFileName = `${item.registerationNumber}_${item.name}_${certLabel}.png`;
        // institution과 certificateName이 같으면(예: 건강보험자격득실확인서) 중간 폴더 중복 제거
        const middleFolder = certificateName && certificateName !== fileName ? `${certificateName}/` : "";
        item.zipPath = `${fileName}/${middleFolder}${finalFileName}`;
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
        await safeBrowserClose(browser);
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(`📂 temp 폴더 삭제 완료: ${tempDir}`);
        }
    }
}

module.exports = { govVerify };
