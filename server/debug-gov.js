// server/debug-gov.js
// 사용법: node server/debug-gov.js [index]
// index: 0~4 (기본 0)
// 예) node server/debug-gov.js 2
//
// 자동 end-to-end 실행. 각 단계 콘솔 로그 + 스크린샷 (./debug-shots/)에 저장.

const fs = require("fs");
const path = require("path");
const { safeBrowserClose } = require("./utils/puppeteerHelper");

const TEST_ITEMS = [
    { reg: "B003", name: "정원정", passNum: "1775-0174-2344-70893" },
    { reg: "B008", name: "박정훈", passNum: "1775-0184-5239-11227" },
    { reg: "B011", name: "조오연", passNum: "1775-0979-9402-30052" },
    { reg: "B013", name: "김민",   passNum: "1775-0590-0705-96977" },
    { reg: "B055", name: "이해나", passNum: "1775-0181-1910-47528" },
];

const idx = parseInt(process.argv[2] ?? "0", 10);
const TEST_ITEM = TEST_ITEMS[idx] || TEST_ITEMS[0];
console.log(`\n=== 테스트 케이스 [${idx}] ${TEST_ITEM.reg} ${TEST_ITEM.name} / ${TEST_ITEM.passNum} ===\n`);

const SHOT_DIR = path.join(__dirname, "debug-shots");
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, label) {
    const file = path.join(SHOT_DIR, `${idx}_${label}.png`);
    try {
        await page.screenshot({ path: file, fullPage: true });
        console.log(`  📸 ${file}`);
    } catch (e) {
        console.log(`  ⚠️ 스크린샷 실패: ${e.message}`);
    }
}

async function main() {
    const puppeteer = require("puppeteer-extra");
    const StealthPlugin = require("puppeteer-extra-plugin-stealth");
    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
        headless: false,
        devtools: false,
        args: [
            "--start-maximized",
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
        ],
        defaultViewport: null,
        timeout: 60000,
    });

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // 콘솔/페이지 에러도 잡아서 로그
    page.on("console", (msg) => console.log(`  [page console] ${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`  [page error] ${err.message}`));

    const url = "https://www.gov.kr/mw/EgovPageLink.do?link=confirm/AA040_confirm_id";

    try {
        console.log(`[STEP 1] 페이지 접속: ${url}`);
        await page.goto(url, { waitUntil: "networkidle2" });
        await page.waitForSelector(".option_box", { timeout: 10000 });
        console.log("  ✅ option_box 로딩 완료");
        await shot(page, "01_loaded");

        console.log(`\n[STEP 2] #issue_type1 라디오 클릭`);
        const isChecked = await page.$eval("#issue_type1", (el) => el.checked);
        console.log(`  현재 checked: ${isChecked}`);
        if (!isChecked) await page.click("#issue_type1");
        console.log("  ✅ 라디오 처리 완료");

        console.log(`\n[STEP 3] 문서확인번호 입력: ${TEST_ITEM.passNum}`);
        const rawPassNum = String(TEST_ITEM.passNum ?? "").replace(/\s/g, "");
        const passParts = rawPassNum.split("-");
        console.log(`  parts: ${JSON.stringify(passParts)}  lengths: ${passParts.map(p => p.length)}`);
        if (passParts.length !== 4) throw new Error(`Invalid passNum format`);
        for (let i = 0; i < 4; i++) {
            await page.click(`#doc_ref_no${i + 1}`, { clickCount: 3 }).catch(() => {});
            await page.type(`#doc_ref_no${i + 1}`, passParts[i], { delay: 30 });
        }
        await sleep(300);
        const enteredValues = await page.evaluate(() => [
            document.querySelector("#doc_ref_no1")?.value,
            document.querySelector("#doc_ref_no2")?.value,
            document.querySelector("#doc_ref_no3")?.value,
            document.querySelector("#doc_ref_no4")?.value,
        ]);
        console.log(`  실제 입력된 값: ${JSON.stringify(enteredValues)}`);
        await shot(page, "02_typed");

        console.log(`\n[STEP 4] #btn_end 클릭 (1차 확인)`);
        const btnClass = await page.$eval("#btn_end", (el) => el.className);
        console.log(`  #btn_end class: "${btnClass}"`);
        await page.click("#btn_end");
        console.log("  ✅ 클릭 완료");
        await sleep(2000);
        await shot(page, "03_after_btn1");

        console.log(`\n[STEP 5] 결과 race (실패팝업 vs 성명 입력칸)`);
        const outcome = await Promise.race([
            page.waitForSelector('#mw_pop_01[style*="block"]', { timeout: 15000 }).then(() => "fail_popup"),
            page.waitForSelector('input[name="doc_ref_key_element"]', { timeout: 15000 }).then(() => "name_input(doc_ref_key_element)"),
            page.waitForSelector("#doc_ref_key", { timeout: 15000 }).then(() => "doc_ref_key"),
        ]).catch((e) => `timeout: ${e.message}`);
        console.log(`  결과: ${outcome}`);

        const popupState = await page
            .$eval("#mw_pop_01", (el) => ({
                display: window.getComputedStyle(el).display,
                inlineStyle: el.getAttribute("style"),
                text: el.innerText.slice(0, 500),
            }))
            .catch(() => null);
        console.log(`  #mw_pop_01 상태: ${JSON.stringify(popupState)}`);

        const visibleInputs = await page.evaluate(() => {
            const all = document.querySelectorAll("input");
            return Array.from(all)
                .filter((el) => el.offsetParent !== null)
                .map((el) => ({
                    id: el.id,
                    name: el.name,
                    type: el.type,
                    placeholder: el.placeholder,
                    value: el.value,
                }));
        });
        console.log(`  현재 보이는 input들:`);
        visibleInputs.forEach((i) => console.log(`    ${JSON.stringify(i)}`));
        await shot(page, "04_after_race");

        if (outcome.startsWith("fail_popup")) {
            console.log(`\n❌ 1차 확인에서 실패 팝업 떴음. 종료.`);
            await sleep(3000);
            return;
        }
        if (outcome.startsWith("timeout")) {
            console.log(`\n❌ 1차 확인 후 아무것도 안 뜸. 종료.`);
            await sleep(3000);
            return;
        }

        console.log(`\n[STEP 6] 성명 입력: ${TEST_ITEM.name}`);
        const hasNameField = await page.$("#doc_ref_key");
        if (hasNameField) {
            await page.type("#doc_ref_key", TEST_ITEM.name, { delay: 30 });
            console.log("  ✅ 성명 입력 완료");
        } else {
            console.log("  ⚠️ #doc_ref_key 셀렉터 없음 — 위 input 목록에서 적절한 셀렉터 찾아야 함");
        }
        await shot(page, "05_name_typed");

        console.log(`\n[STEP 7] #btn_end 다시 클릭 (2차 확인)`);
        await page.click("#btn_end");
        await sleep(2000);
        await shot(page, "06_after_btn2");

        console.log(`\n[STEP 8] 결과 페이지 구조 덤프`);
        await sleep(2000);

        const pageInfo = await page.evaluate(() => {
            const forms = Array.from(document.querySelectorAll("form")).map((f) => ({
                id: f.id, name: f.name, action: f.action,
            }));
            const visibleButtons = Array.from(document.querySelectorAll("button, a"))
                .filter((el) => el.offsetParent !== null)
                .map((el) => ({
                    tag: el.tagName,
                    id: el.id,
                    class: el.className,
                    onclick: el.getAttribute("onclick"),
                    href: el.getAttribute("href"),
                    text: (el.innerText || "").trim().slice(0, 30),
                }))
                .filter((el) => el.text || el.onclick);
            const viewDocCandidates = Array.from(document.querySelectorAll("*"))
                .filter((el) => {
                    const oc = el.getAttribute && el.getAttribute("onclick");
                    return oc && /view_doc|viewDoc|문서확인/i.test(oc);
                })
                .map((el) => ({
                    tag: el.tagName, id: el.id, class: el.className, onclick: el.getAttribute("onclick"),
                }));
            return { url: location.href, forms, visibleButtons, viewDocCandidates };
        });
        console.log(`  현재 URL: ${pageInfo.url}`);
        console.log(`  form 목록: ${JSON.stringify(pageInfo.forms, null, 2)}`);
        console.log(`  view_doc 후보: ${JSON.stringify(pageInfo.viewDocCandidates, null, 2)}`);
        console.log(`  보이는 button/a 목록:`);
        pageInfo.visibleButtons.forEach((b) => console.log(`    ${JSON.stringify(b)}`));

        await shot(page, "07_stage2_result");

        console.log(`\n[STEP 9] "문서확인" 버튼 텍스트 매칭으로 찾아서 클릭 시도`);
        const beforePages = (await browser.pages()).length;
        const clicked = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll("button, a, input[type='button']"));
            const target = candidates.find((el) => {
                const t = (el.innerText || el.value || "").trim();
                return t === "문서확인";
            });
            if (target) {
                target.click();
                return {
                    clicked: true,
                    tag: target.tagName,
                    id: target.id,
                    class: target.className,
                    onclick: target.getAttribute("onclick"),
                };
            }
            return { clicked: false };
        });
        console.log(`  클릭 결과: ${JSON.stringify(clicked)}`);
        await sleep(4000);
        const afterPages = (await browser.pages()).length;
        console.log(`  탭 개수 변화: ${beforePages} → ${afterPages}`);
        await shot(page, "08_after_view_doc_click");

        if (afterPages > beforePages) {
            const allPages = await browser.pages();
            const newPage = allPages[allPages.length - 1];
            await newPage.waitForFunction(() => document.readyState === "complete", { timeout: 20000 }).catch(() => {});
            console.log(`  새 탭 URL: ${newPage.url()}`);
            await sleep(2000);
            await newPage.screenshot({ path: path.join(SHOT_DIR, `${idx}_09_new_tab.png`), fullPage: true }).catch((e) => console.log(`    스샷실패: ${e.message}`));
            const hasViewer = await newPage.$("#viewerFrame");
            console.log(`  #viewerFrame 존재: ${!!hasViewer}`);
        }

        console.log(`\n✅ 디버그 시퀀스 종료. 5초 후 브라우저 닫음.`);
        await sleep(5000);
    } catch (err) {
        console.error("\n❌ 디버그 중 에러:", err);
        try { await shot(page, "99_error"); } catch {}
        await sleep(3000);
    } finally {
        await safeBrowserClose(browser);
    }
}

main();
