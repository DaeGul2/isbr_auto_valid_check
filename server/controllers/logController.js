// server/controllers/logController.js
exports.sendBatchLog = async (req, res) => {
  try {
    const { userName, peopleCount, institutionCount, status } = req.body;
    const { sendLog } = await import('isbr_util');
    await sendLog({
      appName: "진위조회",
      functionName: "verifyBatch", // 또는 원하는 함수명
      userName,
      extra: {
        people_count: peopleCount,
        institution_count: institutionCount,
        status,
      },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ 배치 로그 전송 실패:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
