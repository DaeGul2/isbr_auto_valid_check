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

  try {
    const zip = new JSZip();

    // 1. 이미지 추가 — 개별 항목 실패해도 나머지는 계속 진행
    for (const item of results) {
      try {
        if (item.result === 1 && item.imageBase64 && item.zipPath) {
          zip.file(item.zipPath, item.imageBase64, { base64: true });
        }
      } catch (fileErr) {
        console.error(`⚠️ ZIP 파일 추가 실패 (${item.zipPath}):`, fileErr.message);
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

    // 3. zip 파일 생성 — streamFiles로 메모리 효율적 처리
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return zipBuffer;
  } finally {
    // ✅ cleanup — 성공/실패 관계없이 메모리 해제
    delete globalResultStore[zipName];
  }
}

module.exports = {
  saveVerificationResults,
  createZipFromResults,
};
