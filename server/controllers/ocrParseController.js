const { parseSubmittedDocsZip, resultsToExcelBuffer } = require('../services/ocrParseService');

async function ocrParse(req, res) {
  try {
    const { zipBase64 } = req.body || {};
    if (!zipBase64) {
      return res.status(400).json({ success: false, error: 'zipBase64 필드가 필요합니다.' });
    }
    const buf = Buffer.from(zipBase64, 'base64');
    const data = await parseSubmittedDocsZip(buf);
    res.json({ success: true, data });
  } catch (e) {
    console.error('ocrParse error:', e);
    res.status(500).json({ success: false, error: e.message || '파싱 실패' });
  }
}

async function ocrParseExcel(req, res) {
  try {
    const { results } = req.body || {};
    if (!Array.isArray(results)) {
      return res.status(400).json({ success: false, error: 'results 배열이 필요합니다.' });
    }
    const buf = resultsToExcelBuffer(results);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="parsed_results.xlsx"');
    res.send(buf);
  } catch (e) {
    console.error('ocrParseExcel error:', e);
    res.status(500).json({ success: false, error: e.message || '엑셀 생성 실패' });
  }
}

module.exports = { ocrParse, ocrParseExcel };
