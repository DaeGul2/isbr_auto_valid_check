const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OCR_URL = 'https://2khcjstlni.apigw.ntruss.com/custom/v1/38372/c0900a14255a3a2be14c0ee063c3c5536a71f856761a130c6e6f30c9ec93c899/general';
const SECRET = 'a0h2R1p3TFJOWUxqWXl3VGJLcFVsc3F1UmpJYkdtalU=';

const BASE = path.join(__dirname, '예시파일');

async function ocrFile(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const base64 = fs.readFileSync(filePath).toString('base64');
  const res = await axios.post(OCR_URL, {
    version: 'V2', requestId: 'req-' + Date.now(), timestamp: Date.now(),
    images: [{ format: ext, data: base64, name: 'cert' }]
  }, { headers: { 'X-OCR-SECRET': SECRET } });
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

function parseBirthDate(text) {
  let m = text.match(/(\d{4})\s*\/\s*(\d{2})\s*\/\s*(\d{2})/);
  if (m) return m[1]+m[2]+m[3];
  m = text.match(/(\d{4})\s*\.\s*(\d{2})\s*\.\s*(\d{2})/);
  if (m) return m[1]+m[2]+m[3];
  m = text.match(/(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})/);
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

function parseDisabilityIssueNum(text) {
  let m = text.match(/제\s*(\d{16,22})\s*호/);
  if (m) return m[1];
  m = text.match(/제\s*(\d{4,20}(?:\s+\d{1,20}){1,6})\s*호/);
  if (m) return m[1].replace(/\s/g, '');
  return null;
}

function parseRegistrationNum(text) {
  const m = text.match(/[Rr]egistration[\s\S]{0,30}?(\d{5,10})/);
  return m ? m[1] : null;
}

function parseToeicPassNum(text) {
  const m = text.match(/발급번호[\s:]*(\d{5,10}-\d{5,15})/);
  return m ? m[1] : null;
}

function parseBohunNum(text) {
  const m = text.match(/보훈번호[\s:]*(\d{2,4}-\d{4,8})/);
  return m ? m[1] : null;
}

function parseIssuedDate(text) {
  const m = text.match(/발급일자[\s:]*(\d{4})\s*[-./]\s*(\d{2})\s*[-./]\s*(\d{2})/);
  return m ? m[1]+'-'+m[2]+'-'+m[3] : null;
}

function parseBirthNearKeyword(text) {
  let m = text.match(/[Bb]irth[\s\S]{0,20}?(\d{4})\s*\/\s*(\d{2})\s*\/\s*(\d{2})/);
  if (m) return m[1]+m[2]+m[3];
  m = text.match(/생년월일[\s\S]{0,20}?(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/);
  if (m) return m[1]+m[2].padStart(2,'0')+m[3].padStart(2,'0');
  m = text.match(/생년월일[\s\S]{0,20}?(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})/);
  if (m) return m[1]+m[2]+m[3];
  return null;
}

// ====== 메인 ======

const allFiles = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) walk(fp);
    else allFiles.push(fp);
  }
}
walk(BASE);

(async () => {
  for (const fp of allFiles) {
    const fname = path.basename(fp);
    const folder = path.basename(path.dirname(fp));
    console.log('========================================');
    console.log('파일:', folder + '/' + fname);

    let text;
    try {
      text = await ocrFile(fp);
    } catch(e) {
      console.log('→ OCR 실패:', e.message);
      console.log();
      continue;
    }

    const textNoSpace = text.replace(/\s/g, '');
    const textLower = text.toLowerCase();
    const result = {};

    // ㄱ. 오픽
    if (fname.includes('오픽') || textLower.includes('opic')) {
      result.institution = 'OPIC';
      result.passNum = parseOpicCertNum(text);
      result.birth = parseBirthNearKeyword(text);
    }
    // ㄷ. 등본 (초본보다 먼저 체크 - 둘 다 '주민등록표' 포함)
    else if (fname.includes('등본')) {
      result.institution = '등본';
      result.passNum = parseDocRefNum(text);
      result.birth = parseBirthFromJumin(text);
      result._note = '생년월일은 이름 대조 필요';
    }
    // ㄴ. 초본
    else if (fname.includes('초본') || textNoSpace.includes('주민등록표')) {
      result.institution = '초본';
      result.passNum = parseDocRefNum(text);
      result.birth = parseBirthFromJumin(text);
    }
    // ㅂ. 어학성적사전등록확인서
    else if ((fname.includes('어학') && fname.includes('사전')) || textNoSpace.includes('어학성적사전')) {
      result.institution = '어학성적사전등록확인서';
      result.passNum = parseDocRefNum(text);
      result.birth = parseBirthNearKeyword(text);
    }
    // ㅅ. 건강보험자격득실확인서
    else if (fname.includes('자격득실') || textNoSpace.includes('건강보험자격득실')) {
      result.institution = '건강보험자격득실확인서';
      const gNum = parseGPassNum(text);
      const docNum = parseDocRefNum(text);
      result.passNum = gNum || docNum;
      result.birth = parseBirthFromJumin(text);
      result._note = gNum ? '국민건강보험 출력본(G번호)' : '정부24 출력본(문서확인번호)';
    }
    // ㅇ. 국민연금가입자증명
    else if ((fname.includes('연금') && fname.includes('가입')) || textNoSpace.includes('국민연금가입자')) {
      result.institution = '국민연금가입자증명';
      const docNum = parseDocRefNum(text);
      const npsNum = parseNpsIssueNum(text);
      if (docNum) {
        result.passNum = docNum;
        result.birth = parseBirthNearKeyword(text);
        result._note = '정부24 출력본';
      } else {
        result.passNum = npsNum;
        result.issuedDate = parseIssuedDate(text);
        result.extraNum = parseNpsExtraNum(text);
        result._note = '국민연금공단 출력본';
      }
    }
    // ㅈ. 장애인증명서
    else if (fname.includes('장애인') || textNoSpace.includes('장애인증명서')) {
      result.institution = '장애인증명서';
      result.passNum = parseDocRefNum(text);
      result.extraNum = parseDisabilityIssueNum(text);
      result.birth = parseBirthFromJumin(text);
    }
    // ㅊ. 토익
    else if (fname.includes('토익') || (textLower.includes('toeic') && textLower.includes('listening'))) {
      result.institution = '토익';
      result.passNum = parseToeicPassNum(text);
      result.extraNum = parseRegistrationNum(text);
      result.birth = parseBirthNearKeyword(text);
    }
    // ㅋ. 토플
    else if (fname.includes('토플') || (textLower.includes('toeic') && textLower.includes('speaking'))) {
      result.institution = '토플';
      result.passNum = parseToeicPassNum(text);
      result.extraNum = parseRegistrationNum(text);
      result.birth = parseBirthNearKeyword(text);
    }
    // ㅌ. 취업지원대상
    else if ((fname.includes('취업') && fname.includes('지원')) || textNoSpace.includes('취업지원')) {
      result.institution = '취업지원대상자증명서';
      result.passNum = parseDocRefNum(text);
      result.extraNum = parseBohunNum(text);
      result.birth = parseBirthKorean(text);
    }
    else {
      result._note = '매칭 안됨';
    }

    result.certificateName = result.institution;

    console.log('→ 결과:', JSON.stringify(result, null, 2));
    console.log();
  }
})();
