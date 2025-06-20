const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { getResultScreenshotPath } = require('./utils'); // 유틸리티 함수 import
const { launchBrowser } = require("../utils/puppeteerHelper");


// 지정된 시간만큼 딜레이를 추가하는 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 대한상공회의소 진위 조회 함수
async function daehanLoginAndVerify(item, delayTime, directoryName) {
    // 스크린샷 디렉토리 생성
    const { browser, page } = await launchBrowser();

  

    // 로그인 페이지 이동
    const loginUrl = "https://license.korcham.net/mb/grplogin.do";
    await page.goto(loginUrl, { waitUntil: "networkidle2" });

    // 아이디와 비밀번호 입력
    const userId = "insabareun"; // 로그인 아이디
    const userPw = "isbr8067!"; // 로그인 비밀번호
    await page.type("#uid", userId); // ID 필드에 아이디 입력
    await page.type("#upwd", userPw); // PW 필드에 비밀번호 입력

    // 로그인 버튼 클릭
    await page.keyboard.press("Enter"); // 엔터 키 입력으로 로그인
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    console.log("로그인 성공");

    // 진위여부 확인 페이지로 이동
    const verifyUrl = "https://license.korcham.net/gr/grpLcnsPersonalTruth.do";
    await page.goto(verifyUrl, { waitUntil: "networkidle2" });

    console.log("진위여부 확인 페이지로 이동");

    try {
        // 이름 입력 필드 초기화
        await page.evaluate(() => {
            document.querySelector("#name").value = "";
        });

        // 이름 입력
        await page.type("#name", item.name);

        // 자격증 번호 입력 필드 초기화
        await page.evaluate(() => {
            document.querySelector("#passNo").value = "";
        });

        // 자격증 번호 입력
        await page.type("#passNo", item.passNum);

        // 조회 버튼 클릭
        await page.click("a.btn_wh.s.ml5");
        await delay(delayTime); // 결과 로드 대기

        // 결과 파싱
        const resultText = await page.evaluate(() => {
            const resultList = document.querySelectorAll("#result_list > li");
            return Array.from(resultList).map((el) => el.textContent.trim());
        });


        // 진위 여부 처리
        if (resultText.some((text) => text.includes("종목명"))) {
            const subject = resultText.find((text) => text.includes("종목명")).split(" : ")[1];
            const date = resultText.find((text) => text.includes("합격일자")).split(" : ")[1];
            item.subs = subject;
            item.date = date;
            item.result = 1;
            // 결과 스크린샷 저장
            // const resultScreenshotPath = path.join(screenshotDir, `${item.name}_${item.certificateName}_result.png`);
            const fileName = `${item.registerationNumber}_${item.certificateName}.png`;
            item.zipPath = `자격증/${directoryName}/${fileName}`;

            const buffer = await page.screenshot({ encoding: "base64" });
            item.imageBase64 = buffer;



            console.log(`${item.name}, 합격 여부 : 합격\n종목명 : ${subject}\n합격일 : ${date}`);
        } else {
            item.subs = "";
            item.date = "";
            item.result = 0;
            item.zipPath = null;
            item.imageBase64 = null;

            console.log(`${item.name}, 진위 확인 실패`);
        }

        // 딜레이 추가
        await delay(delayTime);
    } catch (error) {
        item.result = 0;
        item.zipPath = null;
        item.imageBase64 = null;
        console.error(`${item.name} 처리 중 오류 발생:`, error);
    } finally {
        await browser.close();
    }
}

module.exports = { daehanLoginAndVerify };
