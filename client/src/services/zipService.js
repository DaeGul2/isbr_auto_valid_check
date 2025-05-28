import JSZip from "jszip";
import { saveAs } from "file-saver";
import axios from "axios";

// 백엔드 API URL (포트 5050 기준)
const VERIFY_API_URL = "http://localhost:5050/api/verify";

/**
 * 엑셀 데이터 배열을 서버에 보내고, 결과를 zip으로 다운로드
 * @param {Array} inputItems - 엑셀에서 파싱한 각 행 객체들
 * @param {string} zipFileName - 저장될 zip 파일 이름
 */
export async function requestVerificationAndDownloadZip(inputItems, zipFileName = "검증결과.zip") {
  try {
    const response = await axios.post(VERIFY_API_URL, inputItems);
    const { data } = response.data;

    const zip = new JSZip();

    for (const item of data) {
      if (item.result === 1 && item.imageBase64 && item.zipPath) {
        zip.file(item.zipPath, item.imageBase64, { base64: true });
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, zipFileName);
  } catch (error) {
    console.error("❌ zip 생성 중 오류 발생:", error);
    alert("ZIP 파일 생성에 실패했습니다.");
  }
}
