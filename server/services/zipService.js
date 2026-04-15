const JSZip = require('jszip');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ✅ 디스크 기반 저장소 — 서버 죽어도 결과 안 날아감
const STORE_DIR = path.join(__dirname, '..', '.result_store');
const STORE_TTL = 30 * 60 * 1000; // 30분 후 자동 삭제

// 저장소 디렉토리 보장
if (!fs.existsSync(STORE_DIR)) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

/**
 * zipName → 안전한 파일명으로 변환
 */
function toSafeFileName(zipName) {
  return zipName.replace(/[^a-zA-Z0-9가-힣_\-\.]/g, '_') + '.json';
}

function getStorePath(zipName) {
  return path.join(STORE_DIR, toSafeFileName(zipName));
}

/**
 * ✅ 만료된 결과 자동 정리
 */
function cleanupExpiredResults() {
  try {
    if (!fs.existsSync(STORE_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(STORE_DIR);
    for (const file of files) {
      const filePath = path.join(STORE_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > STORE_TTL) {
        fs.unlinkSync(filePath);
        console.warn(`🗑️ 만료된 결과 파일 삭제: ${file}`);
      }
    }
  } catch (err) {
    console.error('⚠️ 결과 정리 중 에러:', err.message);
  }
}

// 5분마다 만료 체크
setInterval(cleanupExpiredResults, 5 * 60 * 1000);

/**
 * ✅ 검증 결과를 디스크에 누적 저장 (서버 재시작해도 유지됨)
 */
function saveVerificationResults(zipName, resultArray) {
  const storePath = getStorePath(zipName);

  let existing = [];
  if (fs.existsSync(storePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    } catch (err) {
      console.error('⚠️ 기존 결과 파일 파싱 실패, 새로 생성:', err.message);
      existing = [];
    }
  }

  existing.push(...resultArray);
  fs.writeFileSync(storePath, JSON.stringify(existing), 'utf-8');
}

/**
 * ✅ 저장된 결과로 ZIP 생성
 */
async function createZipFromResults(zipName) {
  const storePath = getStorePath(zipName);

  if (!fs.existsSync(storePath)) {
    throw new Error('저장된 결과가 없습니다.');
  }

  let results;
  try {
    results = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  } catch (err) {
    throw new Error('결과 파일 읽기 실패: ' + err.message);
  }

  if (!results || results.length === 0) {
    throw new Error('저장된 결과가 비어있습니다.');
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

  // ✅ cleanup — ZIP 생성 성공 후 결과 파일 삭제
  try {
    fs.unlinkSync(storePath);
  } catch (err) {
    console.warn('⚠️ 결과 파일 삭제 실패 (무시):', err.message);
  }

  return zipBuffer;
}

module.exports = {
  saveVerificationResults,
  createZipFromResults,
};
