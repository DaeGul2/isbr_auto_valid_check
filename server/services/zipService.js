const JSZip = require('jszip');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ✅ 디스크 기반 결과 저장소
//   - 기존 메모리(globalResultStore) 방식은 검증 도중 서버가 재시작/크래시하면
//     그때까지 쌓인 결과가 통째로 날아감(클라는 로컬에 결과가 있어 '성공'으로 보임).
//   - OS 임시 폴더에 zipName별로 누적 저장 → 재시작에도 살아남음.
const STORE_ROOT = path.join(os.tmpdir(), 'isbr_result_store');

// zipName을 안전한 폴더/파일명으로
function safeName(str) {
  return String(str || 'unknown').replace(/[^\w.\-가-힣]/g, '_');
}
function storeDir(zipName) {
  return path.join(STORE_ROOT, safeName(zipName));
}

// imageBase64가 Buffer / base64 문자열 / 직렬화된 Buffer 어느 형태든 Buffer로 정규화
function toBuffer(img) {
  if (!img) return null;
  if (Buffer.isBuffer(img)) return img;
  if (typeof img === 'string') return Buffer.from(img, 'base64');
  if (img.type === 'Buffer' && Array.isArray(img.data)) return Buffer.from(img.data);
  return null;
}

// dir 안에서 겹치지 않는 파일명 반환 (0008_SQLD.png → 0008_SQLD_2.png)
function uniqueFileName(dir, fileName) {
  let candidate = fileName;
  let count = 1;
  const dotIdx = fileName.lastIndexOf('.');
  const stem = dotIdx === -1 ? fileName : fileName.slice(0, dotIdx);
  const ext = dotIdx === -1 ? '' : fileName.slice(dotIdx);
  while (fs.existsSync(path.join(dir, candidate))) {
    count += 1;
    candidate = `${stem}_${count}${ext}`;
  }
  return candidate;
}

/**
 * 검증 결과를 누적 저장 (verifyController.js에서 호출)
 * - 이미지: images/ 폴더에 개별 파일로 저장 (충돌 시 _N)
 * - 메타: manifest.jsonl 에 한 줄씩 append (요약 엑셀 생성용)
 */
function saveVerificationResults(zipName, resultArray) {
  const dir = storeDir(zipName);
  const imgDir = path.join(dir, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const manifestFile = path.join(dir, 'manifest.jsonl');

  for (const item of resultArray) {
    let imageFile = null;
    try {
      if (item.result === 1 && item.zipPath) {
        const buf = toBuffer(item.imageBase64);
        if (buf) {
          // 저장용 파일명: zipPath의 마지막 파일명 기준, 폴더 내 유니크 보장
          const base = safeName(path.basename(item.zipPath)) || 'image.png';
          imageFile = uniqueFileName(imgDir, base);
          fs.writeFileSync(path.join(imgDir, imageFile), buf);
        }
      }
    } catch (e) {
      console.error(`⚠️ 결과 이미지 저장 실패 (${item.zipPath}):`, e.message);
    }

    const meta = {
      name: item.name || '',
      registerationNumber: item.registerationNumber || '',
      certificateName: item.certificateName || '',
      institution: item.institution || '',
      result: item.result,
      date: item.date || '',
      subs: item.subs || '',
      error: item.error || '',
      zipPath: item.zipPath || '',
      imageFile, // images/ 내 실제 파일명 (없으면 null)
    };
    fs.appendFileSync(manifestFile, JSON.stringify(meta) + '\n');
  }
}

/**
 * 저장된 결과로 ZIP 생성
 */
async function createZipFromResults(zipName) {
  const dir = storeDir(zipName);
  const manifestFile = path.join(dir, 'manifest.jsonl');

  if (!fs.existsSync(manifestFile)) {
    throw new Error('저장된 결과가 없습니다.');
  }

  const results = fs
    .readFileSync(manifestFile, 'utf-8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (results.length === 0) {
    throw new Error('저장된 결과가 없습니다.');
  }

  try {
    const zip = new JSZip();

    // zipPath 충돌 방지: 같은 경로가 여러 번이면 뒤엣것이 덮어써지는 문제 → _2, _3...
    const usedPaths = new Map();
    function uniqueZipPath(zipPath) {
      if (!usedPaths.has(zipPath)) {
        usedPaths.set(zipPath, 1);
        return zipPath;
      }
      const count = usedPaths.get(zipPath) + 1;
      usedPaths.set(zipPath, count);
      const dotIdx = zipPath.lastIndexOf('.');
      const newPath =
        dotIdx === -1
          ? `${zipPath}_${count}`
          : `${zipPath.slice(0, dotIdx)}_${count}${zipPath.slice(dotIdx)}`;
      return uniqueZipPath(newPath);
    }

    // 1. 이미지 추가 — 디스크에서 읽어 추가
    for (const item of results) {
      try {
        if (item.result === 1 && item.imageFile && item.zipPath) {
          const imgPath = path.join(dir, 'images', item.imageFile);
          if (fs.existsSync(imgPath)) {
            const safePath = uniqueZipPath(item.zipPath);
            if (safePath !== item.zipPath) {
              console.warn(`⚠️ zipPath 중복 → 이름 변경: ${item.zipPath} → ${safePath}`);
            }
            zip.file(safePath, fs.readFileSync(imgPath));
          }
        }
      } catch (fileErr) {
        console.error(`⚠️ ZIP 파일 추가 실패 (${item.zipPath}):`, fileErr.message);
      }
    }

    // 2. 엑셀 요약 (누락 없이 저장된 모든 행)
    const excelData = results.map((item) => ({
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

    // 3. zip 생성
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return zipBuffer;
  } finally {
    // cleanup — 성공/실패 관계없이 디스크 정리
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error('⚠️ 결과 저장소 정리 실패:', e.message);
    }
  }
}

module.exports = {
  saveVerificationResults,
  createZipFromResults,
};
