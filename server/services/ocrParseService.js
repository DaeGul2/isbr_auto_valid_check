const axios = require('axios');
const JSZip = require('jszip');
const iconv = require('iconv-lite');
const path = require('path');
const XLSX = require('xlsx');
const { gptFillMissing, getRequiredFields } = require('./gptFallback');

const OCR_URL =
  process.env.CLOVA_OCR_URL ||
  'https://2khcjstlni.apigw.ntruss.com/custom/v1/38372/c0900a14255a3a2be14c0ee063c3c5536a71f856761a130c6e6f30c9ec93c899/general';
const OCR_SECRET =
  process.env.CLOVA_SECRET_KEY ||
  'a0h2R1p3TFJOWUxqWXl3VGJLcFVsc3F1UmpJYkdtalU=';

// ====== OCR ======
async function ocrBuffer(buf, ext) {
  const base64 = buf.toString('base64');
  const res = await axios.post(
    OCR_URL,
    {
      version: 'V2',
      requestId: 'req-' + Date.now(),
      timestamp: Date.now(),
      images: [{ format: ext, data: base64, name: 'cert' }],
    },
    {
      headers: { 'X-OCR-SECRET': OCR_SECRET },
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );
  const pages = (res.data.images || []).map((img) => ({
    width: img.convertedImageInfo?.width || 0,
    height: img.convertedImageInfo?.height || 0,
    pageIndex: img.convertedImageInfo?.pageIndex || 0,
    fields: (img.fields || []).map((f) => ({
      text: f.inferText,
      vertices: f.boundingPoly?.vertices || [],
    })),
  }));
  const text = pages.flatMap((p) => p.fields.map((f) => f.text)).join(' ');
  return { text, pages };
}

// ====== 파싱 함수들 (run_full_parse.js 에서 그대로) ======
function parseDocRefNum(text) {
  const m = text.match(/(\d{4})[\s\-]*(\d{4})[\s\-]*(\d{4})[\s\-]*(\d{4,5})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] + '-' + m[4] : null;
}

function parseBirthFromJumin(text) {
  const m = text.match(/(\d{6})\s*-\s*[\d*]{1,7}/);
  return m ? m[1] : null;
}

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
      if (year >= 1950 && year <= 2010) return m[1] + m[2] + m[3];
    }
  }
  return null;
}

function parseBirthNearKeyword(text) {
  let m = text.match(/[Dd]ate\s*[Oo]f\s*[Bb]irth[\s\S]{0,100}?(\d{4})\s*\/\s*(\d{2})\s*\/\s*(\d{2})/);
  if (m) return m[1] + m[2] + m[3];
  m = text.match(/생년월일[\s\S]{0,50}?(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/);
  if (m) return m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0');
  m = text.match(/생년월일[\s\S]{0,50}?(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})/);
  if (m) return m[1] + m[2] + m[3];
  return null;
}

function parseBirthKorean(text) {
  const m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  return m ? m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0') : null;
}

function parseOpicCertNum(text) {
  const m = text.match(
    /([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})[\s\-]+([A-Z0-9]{4,5})/
  );
  return m ? m[1] + '-' + m[2] + '-' + m[3] + '-' + m[4] + '-' + m[5] : null;
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
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
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
  if (
    fnLower.includes('토익') ||
    fnLower.includes('toeic') ||
    (textLower.includes('toeic') && textLower.includes('listening'))
  ) {
    const r = { institution: '토익', type: '토익' };
    r.passNum = parseToeicPassNum(text);
    r.birth = parseBirthDateSmart(text);
    r.extraNum = parseToeicRegistration(text, r.passNum);
    results.push(r);
  }

  // ㅋ. 토플
  if (
    fnLower.includes('토플') ||
    fnLower.includes('toefl') ||
    (textLower.includes('toeic') && textLower.includes('speaking'))
  ) {
    const r = { institution: '토플', type: '토플' };
    r.passNum = parseToeicPassNum(text);
    r.birth = parseBirthDateSmart(text);
    r.extraNum = parseToeicRegistration(text, r.passNum);
    results.push(r);
  }

  // ㅎ. 4대 사회보험 가입자 가입내역 확인서
  // 정부24 ver: 문서확인번호({4}-{4}-{4(5)}-{4(5)}) -> passNum
  // 4insure ver: 14자리 발급번호 -> passNum, birth(주민번호 앞자리), 성명 별도
  if (
    (fnLower.includes('4대') || fnLower.includes('사대')) ||
    textNoSpace.includes('4대사회보험') ||
    textNoSpace.includes('가입자가입내역확인')
  ) {
    const isGov24Marker = textNoSpace.includes('정부24') || textLower.includes('gov.kr');
    const r = { institution: '4대 사회보험 가입자 가입내역 확인서', type: '4대사회보험' };
    const docNum = parseDocRefNum(text);
    // 4insure 발급번호: 14자리 숫자 (하이픈 없음)
    const m14 = text.match(/발\s*급\s*번\s*호[\s:：]*(\d{14})/) || text.replace(/\s/g, '').match(/발급번호(\d{14})/);
    if (isGov24Marker && docNum) {
      r.passNum = docNum;
      r._note = '정부24';
    } else if (m14) {
      r.passNum = m14[1];
      r._note = '4insure';
    } else if (docNum) {
      r.passNum = docNum;
      r._note = '정부24(추정)';
    }
    r.birth = parseBirthFromJumin(text);
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

// ====== sourcePath의 최상위 폴더명 추출 ======
function extractFolder(sourcePath) {
  const parts = sourcePath.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts[0];
}

// ====== ZIP 재귀 처리 ======
async function processZipBuffer(buf, prefix = '', concurrency = 3) {
  const zip = await JSZip.loadAsync(buf, {
    decodeFileName: (b) => iconv.decode(b, 'cp949'),
  });

  const tasks = [];
  const innerResults = [];

  const entries = Object.entries(zip.files);
  for (const [name, entry] of entries) {
    if (entry.dir) continue;
    const basename = path.basename(name);
    const ext = path.extname(basename).slice(1).toLowerCase();

    if (basename.includes('증명사진') || basename.includes('여권사진')) continue;

    if (ext === 'zip') {
      try {
        const inner = await entry.async('nodebuffer');
        const sub = await processZipBuffer(inner, prefix + name + '/', concurrency);
        innerResults.push(...sub);
      } catch (e) {
        // 미매칭/실패는 결과에 포함 안 함
      }
      continue;
    }

    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) continue;

    tasks.push({
      basename,
      ext,
      fullPath: prefix + name,
      getBuffer: () => entry.async('nodebuffer'),
    });
  }

  const fileResults = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      const t = tasks[i];
      try {
        const fileBuf = await t.getBuffer();
        const { text, pages } = await ocrBuffer(fileBuf, t.ext === 'jpeg' ? 'jpg' : t.ext);
        const parsed = classifyAndParse(t.basename, text);
        for (const r of parsed) {
          const required = getRequiredFields(r.institution, r._note);
          const sources = {};
          for (const f of required) {
            if (r[f]) sources[f] = 'regex';
          }
          const missing = required.filter((f) => !r[f]);
          if (missing.length > 0) {
            const filled = await gptFillMissing(r.institution, missing, text, r._note);
            for (const k of Object.keys(filled)) {
              if (!r[k]) {
                r[k] = filled[k];
                sources[k] = 'gpt';
              }
            }
          }
          r._sources = sources;
          r._ocrText = text;
          r._ocrPages = pages;
          r._fileBase64 = fileBuf.toString('base64');
          r._fileExt = t.ext;
          fileResults.push({ ...r, sourceFile: t.basename, sourcePath: t.fullPath });
        }
      } catch (e) {
        console.error(`OCR실패: ${t.fullPath} - ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  return [...fileResults, ...innerResults];
}

// ====== 메인 진입점 ======
async function parseSubmittedDocsZip(zipBuffer) {
  const all = await processZipBuffer(zipBuffer);
  // 매칭(institution이 있는) 결과만 유지
  const matched = all.filter((r) => r.institution);

  // 폴더명 기준 그룹핑 (birth 공유)
  const groups = new Map();
  const ungrouped = [];
  for (const r of matched) {
    const folder = extractFolder(r.sourcePath);
    if (folder) {
      if (!groups.has(folder)) groups.set(folder, { folder, items: [] });
      groups.get(folder).items.push(r);
    } else {
      ungrouped.push(r);
    }
  }

  const results = [];
  for (const { folder, items } of groups.values()) {
    const foundBirth = items.find((r) => r.birth)?.birth;
    for (const r of items) {
      results.push(toRow(r, folder, foundBirth));
    }
  }
  for (const r of ungrouped) {
    results.push(toRow(r, '', null));
  }
  return results;
}

function toRow(r, folder, foundBirth) {
  const sources = { ...(r._sources || {}) };
  let birth = r.birth;
  if (!birth && foundBirth) {
    birth = foundBirth;
    sources.birth = 'shared';
  }
  return {
    folder: folder || '',
    institution: r.institution || '',
    certificateName: r.institution || '',
    passNum: r.passNum || '',
    birth: birth || '',
    extraNum: r.extraNum || '',
    issuedDate: r.issuedDate || '',
    sourceFile: r.sourceFile || '',
    sourcePath: r.sourcePath || '',
    note: r._note || '',
    sources,
    ocrText: r._ocrText || '',
    ocrPages: r._ocrPages || [],
    fileBase64: r._fileBase64 || '',
    fileExt: r._fileExt || '',
  };
}

function resultsToExcelBuffer(results) {
  const flat = results.map((r) => ({
    folder: r.folder || '',
    institution: r.institution || '',
    certificateName: r.certificateName || '',
    passNum: r.passNum || '',
    birth: r.birth || '',
    extraNum: r.extraNum || '',
    issuedDate: r.issuedDate || '',
    sourceFile: r.sourceFile || '',
    sourcePath: r.sourcePath || '',
    note: r.note || '',
    gptFilled: Object.entries(r.sources || {})
      .filter(([, v]) => v === 'gpt')
      .map(([k]) => k)
      .join(','),
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(flat);
  XLSX.utils.book_append_sheet(wb, ws, '파싱결과');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseSubmittedDocsZip,
  resultsToExcelBuffer,
};
