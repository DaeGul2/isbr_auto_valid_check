import JSZip from "jszip";
import { saveAs } from "file-saver";
import axios from "axios";
import * as XLSX from "xlsx"; // ✅ 엑셀 생성용 추가

const VERIFY_API_URL = process.env.REACT_APP_VERIFY_API_URL;


/**
 * 엑셀 데이터 배열을 서버에 보내고, 결과를 zip으로 다운로드
 * @param {Array} inputItems - 엑셀에서 파싱한 각 행 객체들
 * @param {string} zipFileName - 저장될 zip 파일 이름
 */
export async function requestVerificationAndDownloadZip(inputItems, zipFileName = "검증결과.zip", userName = "사용자") {
  try {
    const response = await axios.post(VERIFY_API_URL, {
      items: inputItems,
      user: userName
    });
    const { data } = response.data;

    const zip = new JSZip();

    // ✅ 1. 이미지 추가
    for (const item of data) {
      if (item.result === 1 && item.imageBase64 && item.zipPath) {
        zip.file(item.zipPath, item.imageBase64, { base64: true });
      }
    }

    // ✅ 2. 결과요약.xlsx 생성 (기존 certificate.js 구조 그대로)
    const excelData = data.map(item => ({
      name: item.name || "",
      registerationNumber: item.registerationNumber || "",
      certificateName: item.certificateName || "",
      institution: item.institution || "",
      result: item.result,
      date: item.date || "",
      subs: item.subs || "",
      error: item.error || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "진위결과");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    zip.file("결과요약.xlsx", excelBuffer);

    // ✅ 3. zip 다운로드
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, zipFileName);
  } catch (error) {
    console.error("❌ zip 생성 중 오류 발생:", error);
    alert("ZIP 파일 생성에 실패했습니다.");
  }
}
