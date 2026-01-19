import axios from "axios";
import { saveAs } from "file-saver";

// ✅ 1순위: 너가 박아둔 env 직접 사용
const VERIFY_API_URL =
  process.env.REACT_APP_VERIFY_API_URL || "/api/verify";

const ZIP_API_URL =
  process.env.REACT_APP_ZIP_API_URL || "/api/zip";

/**
 * 병렬 요청 처리
 */
export async function verifyInChunks(
  dataObjects,
  user,
  chunkSize = 3,
  onResult,
  zipName,
  hanguksaMode = "withBirth"
) {
  for (let i = 0; i < dataObjects.length; i += chunkSize) {
    const chunk = dataObjects.slice(i, i + chunkSize);

    const responses = await Promise.all(
      chunk.map((item) =>
        axios
          .post(VERIFY_API_URL, {
            items: [item],
            user,
            zipName,
            hanguksaMode,
          })
          .then((res) => {
            const r = res.data.data[0];
            r._index = item._index;
            return r;
          })
          .catch((err) => ({
            ...item,
            result: 0,
            error: err?.response?.data?.error || err.message || "요청 실패",
          }))
      )
    );

    if (onResult) onResult(responses);
  }
}

/**
 * ZIP 다운로드
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
