import axios from "axios";
import { saveAs } from "file-saver";

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
 * ZIP 다운로드 — 성공/실패 여부를 반환
 */
export async function requestZipDownload(zipName, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(
        ZIP_API_URL,
        { zipName },
        {
          responseType: "blob",
          timeout: 60000, // 60초 타임아웃
        }
      );

      // 서버가 JSON 에러를 반환한 경우 (blob이지만 실제로는 JSON)
      if (res.data.type === "application/json") {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.error || "ZIP 생성 실패");
      }

      const blob = new Blob([res.data], { type: "application/zip" });

      // blob 크기 검증
      if (blob.size < 100) {
        throw new Error("ZIP 파일이 비어있습니다.");
      }

      saveAs(blob, zipName);
      return { success: true };
    } catch (err) {
      console.error(`ZIP 다운로드 실패 (시도 ${attempt + 1}/${retries + 1}):`, err);

      if (attempt < retries) {
        // 재시도 전 1초 대기
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const message =
        err?.response?.status === 500
          ? "서버에서 ZIP 생성 중 오류가 발생했습니다."
          : err.message || "ZIP 파일 다운로드에 실패했습니다.";

      return { success: false, error: message };
    }
  }
}
