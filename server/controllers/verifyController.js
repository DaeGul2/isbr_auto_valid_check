const { handleVerification } = require('../services/verifyService');

exports.verifyCertificate = async (req, res) => {
  try {
    const inputArray = req.body; // 배열 형태로 들어옴

    if (!Array.isArray(inputArray)) {
      return res.status(400).json({ success: false, error: '배열 형태로 요청해야 합니다.' });
    }

    const results = [];
    for (const item of inputArray) {
      try {
        const result = await handleVerification(item);
        results.push(result);
      } catch (innerErr) {
        console.error(`❌ ${item.name} 처리 실패`, innerErr);
        results.push({
          ...item,
          result: 0,
          zipPath: null,
          imageBase64: null,
          error: innerErr.message,
        });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('❌ 전체 검증 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
