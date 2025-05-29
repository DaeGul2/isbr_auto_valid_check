import axios from "axios";
import { saveAs } from "file-saver";
import { sendBatchLog } from "./logService";

const VERIFY_API_URL = process.env.REACT_APP_VERIFY_API_URL;
const ZIP_API_URL    = process.env.REACT_APP_ZIP_API_URL;

/**
 * 3개 단위 병렬 요청 처리 및 상태 리턴
 * @param zipName  서버에 결과 누적할 때 사용할 key
 */
export async function verifyInChunks(
  dataObjects,
  user,
  chunkSize = 3,
  onResult,
  zipName   // ← zipName 파라미터 추가
) {
  for (let i = 0; i < dataObjects.length; i += chunkSize) {
    const chunk = dataObjects.slice(i, i + chunkSize);

    const responses = await Promise.all(
      chunk.map(item =>
        axios
          .post(VERIFY_API_URL, {
            items:  [item],
            user,
            zipName,   // ← 여기 포함
          })
          .then(res => {
            const r = res.data.data[0];
            r._index = item._index; // index 보존
            return r;
          })
          .catch(err => ({
            ...item,
            result: 0,
            error: err.message || '요청 실패',
          }))
      )
    );

    if (onResult) onResult(responses);
  }
}

/**
 * 서버에 zip 파일 생성 요청하고 다운로드
 */
export async function requestZipDownload(zipName) {
  try {
    const res = await axios.post(
      ZIP_API_URL,
      { zipName },
      { responseType: "blob" }
    );
    const blob = new Blob([res.data], { type: "application/zip" });
    saveAs(blob, zipName);
  } catch (err) {
    console.error("ZIP 다운로드 실패:", err);
    alert("ZIP 파일 생성 중 오류 발생");
  }
}
