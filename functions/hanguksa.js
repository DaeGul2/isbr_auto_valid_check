const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { getResultScreenshotPath } = require('./utils'); // 유틸리티 함수 import

// 스크린샷 디렉토리 생성
const screenshotDir = "./images/자격증";
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir); // 디렉토리가 없으면 생성
}

function parseBirth(birth) {
    if (!birth) {
        throw new Error("생년월일 데이터가 없습니다.");
    }

    // 문자열로 변환하고 숫자만 남김
    const raw = String(birth).replace(/[^0-9]/g, "");

    if (raw.length === 6) {
        // yyMMdd
        const year = parseInt(raw.slice(0, 2), 10);
        const prefix = year >= 50 ? "19" : "20"; // 50 이상이면 1900년대, 이하이면 2000년대
        return `${prefix}${raw}`;
    } else if (raw.length === 8) {
        // yyyyMMdd
        return raw;
    } else {
        throw new Error(`생년월일 형식이 올바르지 않습니다: ${birth}`);
    }
}


// 지정된 시간만큼 딜레이를 추가하는 함수
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 한국사 사이트 검증 함수
async function hanguksaVerify(item, delayTime) {
    const browser = await puppeteer.launch({
        headless: false, // 브라우저 표시
        args: ["--start-maximized"], // 창 최대화
        defaultViewport: null, // 기본 뷰포트 비활성화
    });

    const page = await browser.newPage();

    // User-Agent 설정
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // 한국사 진위 확인 페이지로 이동
    const verifyUrl = "https://www.historyexam.go.kr/etcPageLink.do?link=trueChk&...";
    await page.goto(verifyUrl, { waitUntil: "networkidle2" });

    console.log("한국사 진위 확인 페이지로 이동");

    try {
        // 인증번호 파싱
        const [firstNum, secondNum] = item.passNum.split("-");
        if (!firstNum || !secondNum) {
            throw new Error("인증번호 형식이 올바르지 않습니다. (올바른 형식: xxxx-xxxxxx)");
        }

        // 이름 입력 필드 초기화 및 입력
        await page.evaluate(() => {
            document.querySelector("#kr_name").value = "";
        });
        await page.type("#kr_name", item.name);

        // 인증번호 첫자리 입력 필드 초기화 및 입력
        await page.evaluate(() => {
            document.querySelector("#certi_front").value = "";
        });
        await page.type("#certi_front", firstNum);

        // 인증번호 둘째자리 입력 필드 초기화 및 입력
        await page.evaluate(() => {
            document.querySelector("#certi_back").value = "";
        });
        await page.type("#certi_back", secondNum);

        // 생년월일 입력
        const formattedBirth = parseBirth(item.birth);
        await page.evaluate(() => {
            document.querySelector("#birth").value = "";
        });
        await page.type("#birth", formattedBirth);

        // 인증번호 확인 버튼 클릭
        await page.click("#btnConfirm");
        await delay(delayTime); // 결과 로드 대기

        // 결과 스크린샷 저장
        // const resultScreenshotPath = path.join(screenshotDir, `${item.name}_한국사_result.png`);
        const resultScreenshotPath = getResultScreenshotPath(screenshotDir, item);
        await page.screenshot({ path: resultScreenshotPath });
        console.log(`결과 페이지 스크린샷 저장: ${resultScreenshotPath}`);

        const result = await page.evaluate(() => {
            const tbody = document.querySelector("tbody");
            if (!tbody) return null;

            // 결과 데이터를 담을 객체 초기화
            const resultData = {};

            // <tr> 내부에서 <th>와 <td>를 한 쌍으로 처리
            const rows = Array.from(tbody.querySelectorAll("tr"));
            rows.forEach((row) => {
                const headers = Array.from(row.querySelectorAll("th")); // <th> 컬럼
                const values = Array.from(row.querySelectorAll("td")); // <td> 데이터

                headers.forEach((header, index) => {
                    const key = header.textContent.trim(); // <th>의 텍스트
                    const value = values[index]?.textContent.trim(); // 대응되는 <td> 값
                    if (key && value) {
                        resultData[key] = value; // 데이터를 key-value로 저장
                    }
                });
            });

            // 데이터 확인
            if (resultData["합격여부"] === "합격") {
                return {
                    isValid: true,
                    data: {
                        회차: resultData["회차"],
                        성명: resultData["성명"],
                        등급: resultData["등급"],
                        합격여부: resultData["합격여부"],
                    },
                };
            } else {
                return { isValid: false, data: null };
            }
        });

        // 결과 처리
        if (result?.isValid) {
            const { 회차, 성명, 등급, 합격여부 } = result.data;
            item.date = 회차; // 회차를 date에 저장

            if (합격여부.trim() === '합격') {
                item.result = 1;
            } else {
                item.result = 0;
            }
            item.subs = `한국사능력검정시험${등급}`; // 등급 및 합격여부 저장
            console.log(
                `${item.name}, 합격 여부 : 합격\n회차 : ${회차}\n등급 : ${등급}, 합격여부 : ${합격여부}`
            );
        } else {
            item.date = ""; // 회차 없음
            item.result = 0; // 실패
            item.subs = ""; // 종목명 없음
            console.log(`${item.name}, 진위 확인 실패`);
        }

        // 딜레이 추가
        await delay(delayTime);
    } catch (error) {
        console.error(`${item.name} 처리 중 오류 발생:`, error);
        item.result = 0; // 실패로 처리
    } finally {
        await browser.close();
    }
}

module.exports = { hanguksaVerify };
