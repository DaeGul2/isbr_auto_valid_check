const { handleVerification } = require("../services/verifyService");
const { createZipFromResults, saveVerificationResults } = require("../services/zipService");

const VERIFY_TIMEOUT = 3 * 60 * 1000; // 3분 — 개별 검증 최대 시간

/**
 * ✅ 타임아웃 래퍼 — 지정 시간 초과 시 에러 throw
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`⏰ 타임아웃: ${label} (${ms / 1000}초 초과)`)), ms)
    ),
  ]);
}

exports.verifyCertificate = async (req, res) => {
  try {
    const { items: inputArray, user, zipName, hanguksaMode } = req.body;

    if (!Array.isArray(inputArray)) {
      return res.status(400).json({ success: false, error: "items는 배열이어야 합니다." });
    }

    // ✅ 입력 검증 — 필수 필드 체크
    for (let i = 0; i < inputArray.length; i++) {
      const item = inputArray[i];
      if (!item.name || !item.institution || !item.passNum) {
        return res.status(400).json({
          success: false,
          error: `items[${i}]에 필수 필드(name, institution, passNum)가 누락되었습니다.`,
        });
      }
    }

    const results = [];
    const institutionCounter = {};

    for (const item of inputArray) {
      try {
        // ✅ 타임아웃 적용 — 하나의 검증이 너무 오래 걸리면 강제 실패 처리
        const result = await withTimeout(
          handleVerification(item, { hanguksaMode }),
          VERIFY_TIMEOUT,
          `${item.name} (${item.institution})`
        );

        const inst = result.institution || "기타";
        institutionCounter[inst] = (institutionCounter[inst] || 0) + 1;

        results.push(result);
      } catch (innerErr) {
        console.error(`❌ ${item.name} 처리 실패:`, innerErr.message);

        const failedItem = {
          ...item,
          result: 0,
          zipPath: null,
          imageBase64: null,
          error: innerErr.message,
        };

        const inst = item.institution || "기타";
        institutionCounter[inst] = (institutionCounter[inst] || 0) + 1;

        results.push(failedItem);
      }
    }

    if (zipName) {
      saveVerificationResults(zipName, results);
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    console.error("❌ 전체 검증 오류:", error);
    // ✅ 이미 응답 보낸 상태인지 확인
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

exports.makeZip = async (req, res) => {
  try {
    const { zipName } = req.body;

    if (!zipName) {
      return res.status(400).json({ success: false, error: "zipName 누락됨" });
    }

    const zipBuffer = await createZipFromResults(zipName);

    res.setHeader("Content-Type", "application/zip");
    res.attachment(zipName);
    res.send(zipBuffer);
  } catch (err) {
    console.error("❌ ZIP 생성 오류:", err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: "ZIP 생성 실패" });
    }
  }
};
