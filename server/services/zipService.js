const JSZip = require('jszip');
const XLSX = require('xlsx');

// ✅ 전역 저장소 (memory 기반)
const globalResultStore = {}; // zipName: result[]

/**
 * 검증 결과를 누적 저장 (verifyController.js에서 호출)
 */
function saveVerificationResults(zipName, resultArray) {
  if (!globalResultStore[zipName]) {
    globalResultStore[zipName] = [];
  }
  globalResultStore[zipName].push(...resultArray);
}

/**
 * 저장된 결과로 ZIP 생성
 */
async function createZipFromResults(zipName) {
  const results = globalResultStore[zipName];
  if (!results || results.length === 0) {
    throw new Error('저장된 결과가 없습니다.');
  }

  const zip = new JSZip();

  // 1. 이미지 추가
  for (const item of results) {
    if (item.result === 1 && item.imageBase64 && item.zipPath) {
      zip.file(item.zipPath, item.imageBase64, { base64: true });
    }
  }

  // 2. 엑셀 요약
  const excelData = results.map(item => ({
    name: item.name || '',
    registerationNumber: item.registerationNumber || '',
    certificateName: item.certificateName || '',
    institution: item.institution || '',
    result: item.result,
    date: item.date || '',
    subs: item.subs || '',
    error: item.error || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '진위결과');
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  zip.file('결과요약.xlsx', excelBuffer);

  // 3. zip 파일 생성
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  // ✅ cleanup
  delete globalResultStore[zipName];

  return zipBuffer;
}

module.exports = {
  saveVerificationResults,
  createZipFromResults,
};
