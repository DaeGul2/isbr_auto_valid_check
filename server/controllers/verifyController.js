const { handleVerification } = require('../services/verifyService');
const { createZipFromResults, saveVerificationResults } = require('../services/zipService');

exports.verifyCertificate = async (req, res) => {
  try {
    const { items: inputArray, user, zipName } = req.body;

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

    // ✅ 결과 저장
    if (zipName) {
      saveVerificationResults(zipName, results);
    }

    // ✅ 로그 전송
    
    return res.json({ success: true, data: results });
  } catch (error) {
    console.error('❌ 전체 검증 오류:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.makeZip = async (req, res) => {
  try {
    const { zipName } = req.body;

    if (!zipName) {
      return res.status(400).json({ success: false, error: 'zipName 누락됨' });
    }

    const zipBuffer = await createZipFromResults(zipName);

    // ZIP 다운로드 헤더 설정: Express res.attachment() 사용
    res.setHeader('Content-Type', 'application/zip');
    res.attachment(zipName);
    res.send(zipBuffer);
  } catch (err) {
    console.error('❌ ZIP 생성 오류:', err);
    return res.status(500).json({ success: false, error: 'ZIP 생성 실패' });
  }
};
