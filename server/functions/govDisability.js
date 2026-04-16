const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { launchBrowser, safeBrowserClose } = require("../utils/puppeteerHelper");

// 장애인증명서 전용: birth(YYMMDD 또는 YYYYMMDD) → YYMMDD 6자리로 정규화
function parseBirthYYMMDD(birth) {
    if (!birth) throw new Error("생년월일(birth) 데이터가 없습니다.");
    const raw = String(birth).replace(/[^0-9]/g, "");
    if (raw.length === 6) return raw;
    if (raw.length === 8) return raw.slice(2, 8);
    throw new Error(`생년월일 형식이 올바르지 않습니다: ${birth}`);
}

// 발급번호 전처리: 숫자만 추출 (공백/하이픈 제거)
function normalizeIssueNumber(v) {
    if (!v) return "";
    return String(v).replace(/[^0-9]/g, "");
}

async function govDisabilityVerify(item, delayTime, fileName, certificateName) {
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

        // ③ 문서확인번호 입력 (4분할, 마지막 칸은 4 또는 5자리)
        const rawPassNum = String(item.passNum ?? "").replace(/\s/g, "");
        const passParts = rawPassNum.split("-");
        if (passParts.length !== 4) throw new Error(`Invalid passNum format: ${item.passNum}`);
        for (let i = 0; i < 4; i++) {
            await page.type(`#doc_ref_no${i + 1}`, passParts[i]);
        }

        // ④ 1차 확인 버튼 클릭
        await page.waitForSelector("#btn_end", { timeout: 10000 });
        await page.click("#btn_end");

        // ⑤ 실패 팝업 여부 판단 (문서확인번호 자체 오류)
        const failPopup = await page.waitForSelector('#mw_pop_01[style*="block"]', { timeout: delayTime }).catch(() => null);
        if (failPopup) {
            item.result = 0;
            item.error = "문서 없음";
            item.zipPath = null;
            item.imageBase64 = null;
            return;
        }

        // ⑥ 2차 입력창 등장 확인
        await page.waitForSelector('input[name="doc_ref_key_element"]', { timeout: 10000 });

        // ⑦ ★라벨 읽어서 3가지 분기★
        // input.closest('.option_box')는 null — 2차 라벨은 별도 .option_box(두 번째)에 존재
        const labelText = await page.evaluate(() => {
            const boxes = Array.from(document.querySelectorAll('.option_box'));
            return boxes.length >= 2 ? (boxes[1].innerText || "") : "";
        });
        console.log(`🔍 2차 입력 라벨: ${labelText.replace(/\s+/g, " ").trim()}`);

        let branch = "성명";
        let valueToType = item.name;

        if (/발\s*급\s*번\s*호/.test(labelText)) {
            branch = "발급번호";
            valueToType = normalizeIssueNumber(item.extraNum);
            if (!valueToType) throw new Error("발급번호(extraNum) 값이 없습니다.");
        } else if (/주\s*민\s*등\s*록\s*번\s*호/.test(labelText)) {
            branch = "주민번호앞6자리";
            valueToType = parseBirthYYMMDD(item.birth);
        } else {
            branch = "성명";
            valueToType = item.name;
        }
        console.log(`🔀 분기: ${branch} → 입력값: ${valueToType}`);

        // ⑧ 분기별 값 입력 및 재확인 클릭
        await page.type('#doc_ref_key', String(valueToType));
        await page.waitForSelector("#btn_end", { timeout: 10000 });
        await page.click("#btn_end");

        // ⑨ 2차 실패 팝업 체크 (발급번호/주민번호/성명 불일치)
        const failPopup2 = await page.waitForSelector('#mw_pop_01[style*="block"]', { timeout: 3000 }).catch(() => null);
        if (failPopup2) {
            item.result = 0;
            item.error = `2차 값 불일치(${branch})`;
            item.zipPath = null;
            item.imageBase64 = null;
            return;
        }

        // ⑩ 결과 페이지 등장 대기 → temp1 스크린샷
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

        // ⑪ 문서확인 버튼 클릭 → 새 탭 열림
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

        await new Promise(resolve => setTimeout(resolve, 3000));
        const pages = await browser.pages();
        const newPage = pages[pages.length - 1];
        await newPage.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 });

        // ⑫ iframe 접근 및 PDF 로딩 대기
        await newPage.waitForSelector('#viewerFrame', { timeout: 40000 });
        const frameHandle = await newPage.$('#viewerFrame');
        const frame = await frameHandle.contentFrame();
        await frame.waitForSelector('.page', { timeout: 15000 });
        await frame.waitForSelector('.textLayer', { timeout: 15000 });

        // ⑬ 뷰포트 축소 후 temp2
        await newPage.setViewport({ width: 1200, height: 1000 });
        const temp2Path = path.join(tempDir, "temp2.png");
        await newPage.screenshot({ path: temp2Path, fullPage: true });
        console.log(`📸 temp2 저장: ${temp2Path}`);

        // ⑭ 이미지 가로 병합
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
        const middleFolder = certificateName && certificateName !== fileName ? `${certificateName}/` : "";
        item.zipPath = `${fileName}/${middleFolder}${finalFileName}`;
        item.imageBase64 = imageBuffer.toString("base64");
        item.result = 1;
        item.branch = branch;

        fs.unlinkSync(temp1Path);
        fs.unlinkSync(temp2Path);
        console.log("📂 temp 이미지 삭제 완료");
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0;
        item.error = item.error || "처리중 오류";
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

module.exports = { govDisabilityVerify };
