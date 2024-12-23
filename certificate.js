const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { daehanLoginAndVerify } = require("./functions/daehan");
const { hanguksaVerify } = require("./functions/hanguksa");
const { dataSaneopVerify } = require('./functions/dataSaneop');
const { kpcLicenseVerify } = require('./functions/kpcLicenseVerify');
const { opicVerify } = require('./functions/opic');
const { semuVerify } = require('./functions/semu');
const { insuranceNhis } = require('./functions/insuranceNhis'); // 건보홈페이지 건보득실확인서
const { govVerify } = require('./functions/gov');

// 엑셀 데이터를 읽는 함수
function readExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // 첫 번째 시트
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet); // JSON 형식으로 변환
    return data; // [{ name: "홍길동", passNum: "123456789012", institution: "대한상공회의소" }, ...]
}

// 엑셀 데이터를 저장하는 함수
function writeExcel(data, outputFilePath) {
    const worksheet = xlsx.utils.json_to_sheet(data); // JSON 데이터를 시트로 변환
    const workbook = xlsx.utils.book_new(); // 새로운 워크북 생성
    xlsx.utils.book_append_sheet(workbook, worksheet, "Results"); // 시트 추가
    xlsx.writeFile(workbook, outputFilePath); // 파일 저장
}

// 실행
(async () => {
    const filePath = "./자격증.xlsx"; // 입력 엑셀 파일 경로
    const outputFilePath = "./results/result.xlsx"; // 결과를 저장할 엑셀 파일 경로

    // 데이터 읽기
    const globalExcelData = readExcel(filePath); // 전역적으로 관리될 엑셀 데이터
    console.log("입력 데이터:", globalExcelData);

    const delayTime = 500;

    // 데이터 행별로 처리
    for (const item of globalExcelData) {
        const institution = (item.institution || "").trim(); // 공백 제거

        try {
            if (institution === "한국세무사회") {
                // 대한상공회의소 진위 조회
                await semuVerify(item, delayTime);
            }
            // else if (institution === "대한상공회의소") {
            //     // 대한상공회의소 진위 조회
            //     await daehanLoginAndVerify(item, delayTime);
            // } 
            // else if (institution === "국사편찬위원회") {
            //     await hanguksaVerify(item, delayTime);
            // } 

            // else if(institution ==='한국생산성본부'){
            //     await kpcLicenseVerify(item, delayTime);
            // }
            // else if(institution ==='opic'){
            //     await opicVerify(item, delayTime);
            // }
            else if (institution === '초본') {
                await govVerify(item, delayTime, "초본");
            }
            else if (institution === "건강보험자격득실확인서") {
                const passNum = (item.passNum || "").trim(); // 공백 제거

                // 1730-3002-0530-3240 형식 (숫자-숫자-숫자-숫자)
                if (/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(passNum)) {
                    await govVerify(item, delayTime, "건강보험자격득실확인서");
                }
                
                else {
                    await insuranceNhis(item, delayTime);
                }
                

            }

            //  else             if (institution === "한국데이터산업진흥원") {
            //     await dataSaneopVerify(item, globalExcelData);
            // }   // 데이터 산업진흥원은 막혀있음 ㅠㅠ
            else {
                console.error(`알 수 없는 기관: ${institution}`);
                item.result = "Unknown Institution"; // 결과 처리
            }
        } catch (error) {
            console.error(`${item.name} 처리 중 오류 발생:`, error);
            item.error = error.message; // 오류 메시지를 item에 저장
        }
    }

    // 전역 데이터 저장
    writeExcel(globalExcelData, outputFilePath);
    console.log(`결과가 '${outputFilePath}'에 저장되었습니다.`);
})();