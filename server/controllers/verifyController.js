const { handleVerification } = require('../services/verifyService');

exports.verifyCertificate = async (req, res) => {
  try {
    const { items: inputArray, user } = req.body;

    if (!Array.isArray(inputArray)) {
      return res.status(400).json({ success: false, error: 'items는 배열이어야 합니다.' });
    }

    const results = [];
    const institutionCounter = {};
    let hasError = false;

    for (const item of inputArray) {
      try {
        const result = await handleVerification(item);

        // institution 카운트 누적
        const inst = result.institution || '기타';
        institutionCounter[inst] = (institutionCounter[inst] || 0) + 1;

        results.push(result);
      } catch (innerErr) {
        console.error(`❌ ${item.name} 처리 실패`, innerErr);

        hasError = true;

        const failedItem = {
          ...item,
          result: 0,
          zipPath: null,
          imageBase64: null,
          error: innerErr.message,
        };

        // institution 카운트에도 실패 항목 포함
        const inst = item.institution || '기타';
        institutionCounter[inst] = (institutionCounter[inst] || 0) + 1;

        results.push(failedItem);
      }
    }

    // ✅ 로그 전송
    try {
      const { sendLog } = await import('isbr_util');
      await sendLog({
        appName: "진위조회",
        functionName: "verifyCertification",
        userName: user || "이름없음",
        extra: {
          people_count: inputArray.length,
          institution_count: institutionCounter,
          status: hasError ? 0 : 1,
        },
      });
      console.log("✅ 로그 전송 완료");
    } catch (logErr) {
      console.error("❌ 로그 전송 실패:", logErr);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('❌ 전체 검증 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
