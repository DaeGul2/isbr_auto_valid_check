const { launchBrowser, safeBrowserClose } = require("../utils/puppeteerHelper");

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 4대 사회보험 포털(www.4insure.or.kr) 발급사실 확인
// item 필수 필드: passNum(발급번호 14자리), name(성명), birth(yymmdd or yyyymmdd)
async function insurance4InsureVerify(item, delayTime) {
    const url = "https://www.4insure.or.kr/pbiz/cert/selectCerfIssuFctView.do";
    const { browser, page } = await launchBrowser();

    try {
        await page.goto(url, { waitUntil: "networkidle2" });
        console.log("✅ 4insure 발급사실확인 페이지 접속 완료");

        // ① 가입자 가입내역 확인서 라디오 선택 (default이지만 명시적으로 클릭)
        await page.waitForSelector("#lb01_01", { timeout: 10000 });
        await page.evaluate(() => {
            const radio = document.querySelector("#lb01_01");
            if (radio && typeof radio.click === "function") radio.click();
        });

        // ② 발급번호 입력 (하이픈/공백 제거)
        const issuNo = String(item.passNum ?? "").replace(/[-\s]/g, "");
        if (!issuNo) throw new Error("발급번호(passNum)가 없습니다.");
        await page.waitForSelector("#iptIssuNo", { visible: true });
        await page.type("#iptIssuNo", issuNo);
        console.log("✅ 발급번호 입력:", issuNo);

        // ③ 성명 입력
        const name = String(item.name ?? "").trim();
        if (!name) throw new Error("성명(name)이 없습니다.");
        await page.type("#iptIdntyNm", name);
        console.log("✅ 성명 입력:", name);

        // ④ 주민번호 앞자리(yymmdd) 입력
        let birthDigits = String(item.birth ?? "").replace(/\D/g, "");
        if (birthDigits.length === 8) birthDigits = birthDigits.slice(2);  // yyyymmdd -> yymmdd
        if (birthDigits.length !== 6) {
            throw new Error(`birth 형식 오류 (yymmdd/yyyymmdd 필요): ${item.birth}`);
        }
        await page.type("#iptFrntRrno", birthDigits);
        console.log("✅ 주민번호 앞자리 입력:", birthDigits);

        // ⑤ 조회 버튼 클릭
        await page.waitForSelector("#btnSubmit", { visible: true });
        await page.click("#btnSubmit");
        console.log("✅ 조회 버튼 클릭 완료");

        // ⑥ 결과 대기 (성공/실패 텍스트 중 하나 등장)
        await page.waitForFunction(
            () => {
                const text = document.body && document.body.innerText ? document.body.innerText : "";
                return /발급된 사실이 있습니다|발급된 사실이 없습니다|발급사실이 없|일치하지 않|존재하지 않/.test(text);
            },
            { timeout: (delayTime || 0) + 20000 }
        );

        // 추가 안정화 대기
        await delay(800);

        const pageText = await page.evaluate(() => document.body.innerText || "");

        if (pageText.includes("발급된 사실이 있습니다")) {
            const certName = String(item.certificateName ?? "").trim() || "4대 사회보험 가입자 가입내역 확인서";
            const fileName = `${item.registerationNumber}_${item.name}_${certName}.png`;
            item.zipPath = `4대 사회보험 가입자 가입내역 확인서/${fileName}`;
            const buffer = await page.screenshot({ encoding: "base64", fullPage: true });
            item.imageBase64 = buffer;
            item.result = 1;
            console.log(`✅ ${name} - 4insure 진위확인 성공`);
        } else {
            item.result = 0;
            item.error = "발급사실 없음 또는 입력값 불일치";
            item.zipPath = null;
            item.imageBase64 = null;
            console.log(`❌ ${name} - 4insure 진위확인 실패`);
        }
    } catch (error) {
        console.error(`${item.name} 4insure 처리 중 오류 발생:`, error);
        item.result = 0;
        item.error = `처리중 오류: ${error.message || error}`;
        item.zipPath = null;
        item.imageBase64 = null;
    } finally {
        await safeBrowserClose(browser);
    }
}

module.exports = { insurance4InsureVerify };
