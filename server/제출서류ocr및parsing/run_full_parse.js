const fs = require('fs');
const path = require('path');
const axios = require('axios');
const JSZip = require('jszip');
const iconv = require('iconv-lite');
const XLSX = require('xlsx');

const OCR_URL = 'https://2khcjstlni.apigw.ntruss.com/custom/v1/38372/c0900a14255a3a2be14c0ee063c3c5536a71f856761a130c6e6f30c9ec93c899/general';
const SECRET = 'a0h2R1p3TFJOWUxqWXl3VGJLcFVsc3F1UmpJYkdtalU=';

const BASE_DIR = 'C:/Users/alsxo/Documents/카카오톡 받은 파일/2026년 업무직, 체험형인턴, 대체인력 채용 공고_첨부파일저장';

// ====== OCR ======
async function ocrBuffer(buf, ext) {
  const base64 = buf.toString('base64');
  const res = await axios.post(OCR_URL, {
    version: 'V2', requestId: 'req-' + Date.now(), timestamp: Date.now(),
    images: [{ format: ext, data: base64, name: 'cert' }]
  }, { headers: { 'X-OCR-SECRET': SECRET }, timeout: 30000 });
  return res.data.images.flatMap(img => img.fields.map(f => f.inferText)).join(' ');
}

// ====== 파싱 함수들 ======
function parseDocRefNum(text) {
  const m = text.match(/(\d{4})[\s\-]*(\d{4})[\s\-]*(\d{4})[\s\-]*(\d{4,5})/);
  return m ? m[1]+'-'+m[2]+'-'+m[3]+'-'+m[4] : null;
}

function parseBirthFromJumin(text) {
  const m = text.match(/(\d{6})\s*-\s*[\d*]{1,7}/);
  return m ? m[1] : null;
}

// yyyy/mm/dd 전체 스캔 + 1950~2010 필터
function parseBirthDateSmart(text) {
  const patterns = [
    /(\d{4})\s*\/\s*(\d{2})\s*\/\s*(\d{2})/g,
    /(\d{4})\s*\.\s*(\d{2})\s*\.\s*(\d{2})/g,
    /(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const year = parseInt(m[1]);
      if (year >= 1950 && year <= 2010) return m[1]+m[2]+m[3];
    }
  }
  return null;
}

function parseBirthNearKeyword(text) {
  // 넓은 범위(100자) 탐색
  let m = text.match(/[Dd]ate\s*[Oo]f\s*[Bb]irth[\s\S]{0,100}?(\d{4})\s*\/\s*(\d{2})\s*\/\s*(\d{2})/);
  if (m) return m[1]+m[2]+m[3];
  m = text.match(/생년월일[\s\S]{0,50}?(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/);
  if (m) return m[1]+m[2].padStart(2,'0')+m[3].padStart(2,'0');
  m = text.match(/생년월일[\s\S]{0,50}?(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})/);
  if (m) return m[1]+m[2]+m[3];
  return null;
}

function parseBirthKorean(text) {
  const m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  return m ? m[1] + m[2].padStart(2,'0') + m[3].padStart(2,'0') : null;
}

function parseOpicCertNum(text) {
  const m = text.match(/([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})/);
  return m ? m[1]+'-'+m[2]+'-'+m[3]+'-'+m[4]+'-'+m[5] : null;
}

function parseGPassNum(text) {
  const m = text.match(/(G\d{10,20})/);
  return m ? m[1] : null;
}

function parseNpsIssueNum(text) {
  const m = text.match(/발급번호[\s:]*(\S+)/);
  if (m && m[1].includes('-')) return m[1];
  return null;
}

function parseNpsExtraNum(text) {
  const m = text.match(/검증번호[\s:]*([A-Za-z0-9]{2,10})/);
  return m ? m[1] : null;
}

function parseIssuedDate(text) {
  const m = text.match(/발급일자[\s:]*(\d{4})\s*[-./]\s*(\d{2})\s*[-./]\s*(\d{2})/);
  return m ? m[1]+'-'+m[2]+'-'+m[3] : null;
}

function parseDisabilityIssueNum(text) {
  let m = text.match(/제\s*(\d{16,22})\s*호/);
  if (m) return m[1];
  m = text.match(/제\s*(\d{4,20}(?:\s+\d{1,20}){1,6})\s*호/);
  if (m) return m[1].replace(/\s/g, '');
  return null;
}

function parseToeicPassNum(text) {
  const m = text.match(/발급\s*번호[\s:]*(\d{5,10}-\d{5,15})/);
  return m ? m[1] : null;
}

// 토익/토플 Registration: passNum 앞 6자리 재사용 or 단독 6자리
function parseToeicRegistration(text, passNum) {
  if (passNum) {
    const front = passNum.split('-')[0];
    if (front && /^\d{6}$/.test(front)) return front;
  }
  return null;
}

function parseBohunNum(text) {
  const m = text.match(/보훈번호[\s:]*(\d{2,4}-\d{4,8})/);
  return m ? m[1] : null;
}

// ====== 서류 분류 + 파싱 ======
function classifyAndParse(fname, text) {
  const fnLower = fname.toLowerCase();
  const textNoSpace = text.replace(/\s/g, '');
  const textLower = text.toLowerCase();
  const results = [];

  // ㄱ. 오픽
  if (fnLower.includes('오픽') || fnLower.includes('opic') || textLower.includes('opic')) {
    const r = { institution: 'OPIC', type: '오픽' };
    r.passNum = parseOpicCertNum(text);
    r.birth = parseBirthNearKeyword(text) || parseBirthDateSmart(text);
    results.push(r);
  }

  // ㄴ. 초본
  if (fnLower.includes('초본') || (textNoSpace.includes('주민등록표') && textNoSpace.includes('초본'))) {
    const r = { institution: '초본', type: '초본' };
    r.passNum = parseDocRefNum(text);
    r.birth = parseBirthFromJumin(text);
    results.push(r);
  }

  // ㄷ. 등본
  if (fnLower.includes('등본') || (textNoSpace.includes('주민등록표') && textNoSpace.includes('등본'))) {
    const r = { institution: '등본', type: '등본' };
    r.passNum = parseDocRefNum(text);
    r.birth = parseBirthFromJumin(text);
    r._note = '생년월일 이름대조 필요';
    results.push(r);
  }

  // ㅂ. 어학성적사전등록확인서
  if ((fnLower.includes('어학') && fnLower.includes('사전')) || textNoSpace.includes('어학성적사전')) {
    const r = { institution: '어학성적사전등록확인서', type: '어학성적사전등록확인서' };
    r.passNum = parseDocRefNum(text);
    r.birth = parseBirthNearKeyword(text);
    results.push(r);
  }

  // ㅅ. 건강보험자격득실확인서
  if (fnLower.includes('자격득실') || textNoSpace.includes('건강보험자격득실')) {
    const r = { institution: '건강보험자격득실확인서', type: '건강보험' };
    const gNum = parseGPassNum(text);
    const docNum = parseDocRefNum(text);
    r.passNum = gNum || docNum;
    r.birth = parseBirthFromJumin(text);
    r._note = gNum ? '국민건강보험(G번호)' : '정부24(문서확인번호)';
    results.push(r);
  }

  // ㅇ. 국민연금가입자증명
  if ((fnLower.includes('연금') && fnLower.includes('가입')) || textNoSpace.includes('국민연금가입자')) {
    const r = { institution: '국민연금가입자증명', type: '국민연금' };
    const docNum = parseDocRefNum(text);
    if (docNum) {
      r.passNum = docNum;
      r.birth = parseBirthNearKeyword(text) || parseBirthDateSmart(text);
      r._note = '정부24';
    } else {
      r.passNum = parseNpsIssueNum(text);
      r.issuedDate = parseIssuedDate(text);
      r.extraNum = parseNpsExtraNum(text);
      r._note = '국민연금공단';
    }
    results.push(r);
  }

  // ㅈ. 장애인증명서
  if (fnLower.includes('장애인') || textNoSpace.includes('장애인증명서')) {
    const r = { institution: '장애인증명서', type: '장애인' };
    r.passNum = parseDocRefNum(text);
    r.extraNum = parseDisabilityIssueNum(text);
    r.birth = parseBirthFromJumin(text);
    results.push(r);
  }

  // ㅊ. 토익
  if (fnLower.includes('토익') || fnLower.includes('toeic') || (textLower.includes('toeic') && textLower.includes('listening'))) {
    const r = { institution: '토익', type: '토익' };
    r.passNum = parseToeicPassNum(text);
    r.birth = parseBirthDateSmart(text);
    r.extraNum = parseToeicRegistration(text, r.passNum);
    results.push(r);
  }

  // ㅋ. 토플
  if (fnLower.includes('토플') || fnLower.includes('toefl') || (textLower.includes('toeic') && textLower.includes('speaking'))) {
    const r = { institution: '토플', type: '토플' };
    r.passNum = parseToeicPassNum(text);
    r.birth = parseBirthDateSmart(text);
    r.extraNum = parseToeicRegistration(text, r.passNum);
    results.push(r);
  }

  // ㅌ. 취업지원대상
  if ((fnLower.includes('취업') && fnLower.includes('지원')) || textNoSpace.includes('취업지원')) {
    const r = { institution: '취업지원대상자증명서', type: '취업지원' };
    r.passNum = parseDocRefNum(text);
    r.extraNum = parseBohunNum(text);
    r.birth = parseBirthKorean(text);
    results.push(r);
  }

  return results;
}

// ====== ZIP 내 파일 추출 + OCR ======
async function processZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf, {
    decodeFileName: (b) => iconv.decode(b, 'cp949')
  });

  const fileResults = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const basename = path.basename(name);
    const ext = path.extname(basename).slice(1).toLowerCase();
    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) continue;
    // 증명사진 제외
    if (basename.includes('증명사진') || basename.includes('여권사진')) continue;

    try {
      const fileBuf = await entry.async('nodebuffer');
      const text = await ocrBuffer(fileBuf, ext === 'jpeg' ? 'jpg' : ext);
      const parsed = classifyAndParse(basename, text);
      if (parsed.length > 0) {
        fileResults.push(...parsed.map(r => ({ ...r, sourceFile: basename })));
      }
    } catch(e) {
      console.error(`  OCR실패: ${basename} - ${e.message}`);
    }
  }
  return fileResults;
}

// ====== 재귀 ZIP 찾기 ======
function findZips(dir) {
  let zips = [];
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) zips = zips.concat(findZips(fp));
    else if (f.toLowerCase().endsWith('.zip')) zips.push(fp);
  }
  return zips;
}

// ====== 메인 ======
(async () => {
  const dirs = fs.readdirSync(BASE_DIR).filter(d => {
    return fs.statSync(path.join(BASE_DIR, d)).isDirectory();
  });

  const allResults = [];
  let processed = 0;

  for (const dir of dirs) {
    const m = dir.match(/^([\d-]+)\((.+)\)$/);
    if (!m) continue;
    const regNum = m[1];
    const name = m[2];

    const taskDir = path.join(BASE_DIR, dir, '과제 제출 파일');
    if (!fs.existsSync(taskDir)) continue;

    const zips = findZips(taskDir);
    if (zips.length === 0) continue;

    processed++;
    console.log(`[${processed}/${dirs.length}] ${regNum} ${name}`);

    const personResults = [];
    for (const zipPath of zips) {
      try {
        const results = await processZip(zipPath);
        personResults.push(...results);
      } catch(e) {
        console.error(`  ZIP오류: ${e.message}`);
      }
    }

    // 공통 birth: 한 곳에서라도 찾았으면 다른 곳에 채워넣기
    const foundBirth = personResults.find(r => r.birth && !r.birth.includes('주의'))?.birth;

    for (const r of personResults) {
      if (!r.birth && foundBirth) r.birth = foundBirth;
      r.registerationNumber = regNum;
      r.name = name;
      r.certificateName = r.institution;
      allResults.push(r);
      console.log(`  → ${r.type}: passNum=${r.passNum || 'X'} birth=${r.birth || 'X'} extra=${r.extraNum || '-'} issued=${r.issuedDate || '-'}`);
    }

    if (personResults.length === 0) {
      console.log('  → 매칭 서류 없음');
    }
  }

  // 엑셀 출력
  const excelRows = allResults.map(r => ({
    registerationNumber: r.registerationNumber,
    name: r.name,
    institution: r.institution,
    passNum: r.passNum || '',
    certificateName: r.certificateName,
    birth: r.birth || '',
    issuedDate: r.issuedDate || '',
    extraNum: r.extraNum || '',
    sourceFile: r.sourceFile || '',
    _note: r._note || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, ws, '파싱결과');
  const outPath = path.join(BASE_DIR, '..', '파싱결과_전체.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n========================================`);
  console.log(`완료. 총 ${dirs.length}명 중 ${processed}명 처리, ${allResults.length}건 추출`);
  console.log(`결과 저장: ${outPath}`);
})();
