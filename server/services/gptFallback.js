const axios = require('axios');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// 기관별 필요 필드 + 각 필드 추출 규칙 설명
const FIELD_RULES = {
  OPIC: {
    passNum:
      "OPIC 인증서번호. 5개의 4~5자리 영숫자 그룹이 하이픈으로 연결됨 (예: '11V1-KIGS-Q507-W361-6IDN'). 소문자 없음. 공집합표시는 숫자 0이 아닌 알파벳 O일 수 있음. 1과 대문자 I 구분 주의. 결과는 'XXXX-XXXX-XXXX-XXXX-XXXX' 형식 그대로 반환.",
    birth:
      "생년월일. 'Date of Birth' 라벨 근처 또는 문서 내 yyyy/mm/dd 패턴 중 1950~2010 범위인 것. yyyymmdd 8자리 숫자 형식으로 반환 (예: 19980312). Test date(시험일자)와 혼동 금지.",
  },
  초본: {
    passNum:
      "문서확인번호. '문서확인번호' 라벨 뒤에 '1701-0863-0015-1128' 형태로 존재. {4}-{4}-{4}-{4 또는 5} 형식. 결과는 하이픈 포함해서 그대로 반환.",
    birth:
      "주민등록번호 앞 6자리(yymmdd). '주민등록번호' 라벨 뒤에 'yymmdd-XXXXXXX' 형태에서 앞 6자리만. 결과는 yymmdd 6자리 숫자.",
  },
  등본: {
    passNum:
      "문서확인번호. '문서확인번호' 라벨 뒤에 '1701-0863-0015-1128' 형태로 존재. {4}-{4}-{4}-{4 또는 5} 형식. 결과는 하이픈 포함해서 그대로 반환.",
    birth:
      "주민등록번호 앞 6자리(yymmdd). 결과는 yymmdd 6자리 숫자.",
  },
  어학성적사전등록확인서: {
    passNum:
      "문서확인번호. {4}-{4}-{4}-{4 또는 5} 형식. 하이픈 포함해서 반환.",
    birth:
      "'생년월일' 텍스트 뒤에 'yyyy. mm. dd.' 형식. 결과는 yyyymmdd 8자리 숫자.",
  },
  건강보험자격득실확인서: {
    passNum:
      "문서확인번호({4}-{4}-{4}-{4 또는 5}) 또는 발급번호(G + 10~20자리 숫자). 둘 중 존재하는 것 하나. 형식 그대로 반환.",
    birth:
      "주민등록번호 앞 6자리(yymmdd). 'yymmdd-XXXXXXX' 형태에서 앞 6자리. 결과는 yymmdd 6자리 숫자.",
  },
  국민연금가입자증명: {
    passNum:
      "문서확인번호({4}-{4}-{4}-{4 또는 5}) 또는 발급번호({}-{}-{} 형태, 예: '2023112B-H272-775837'). 둘 중 하나. 형식 그대로 반환.",
    birth:
      "'생년월일' 텍스트 뒤 'yyyy-mm-dd' 또는 yyyy/mm/dd. 결과는 yyyymmdd 8자리 숫자.",
    extraNum:
      "검증번호. '검증번호' 텍스트 옆에 '75LM' 같이 2~10자리 영숫자. 정부24 출력본에는 없을 수 있음(없으면 null).",
    issuedDate:
      "'발급일자' 옆 yyyy-mm-dd. 정부24 출력본에는 없을 수 있음(없으면 null). 결과는 yyyy-mm-dd 형식.",
  },
  장애인증명서: {
    passNum:
      "문서확인번호 {4}-{4}-{4}-{4 또는 5}. 하이픈 포함 반환.",
    extraNum:
      "발급번호. '제 16~22자리숫자 호' 형태. 숫자 부분만 추출(공백 제거).",
    birth:
      "주민등록번호 앞 6자리(yymmdd). 결과는 yymmdd 6자리 숫자.",
  },
  토익: {
    passNum:
      "발급번호 '{6자리}-{10자리}' 형태 (예: '097199-0410009001'). 하이픈 포함 반환.",
    birth:
      "Date of birth 근처 yyyy/mm/dd 패턴 중 1950~2010 범위. yyyymmdd 8자리 숫자로 반환.",
    extraNum:
      "Registration number. 6자리 숫자. 발급번호 앞 6자리와 같은 경우가 많음.",
  },
  토플: {
    passNum:
      "발급번호 '{6자리}-{10자리}' 형태. 하이픈 포함 반환.",
    birth:
      "Date of birth 근처 yyyy/mm/dd 패턴 중 1950~2010 범위. yyyymmdd 8자리 숫자.",
    extraNum:
      "Registration number. 6자리 숫자.",
  },
  '4대 사회보험 가입자 가입내역 확인서': {
    passNum:
      "정부24 ver: 문서확인번호 {4}-{4}-{4 또는 5}-{4 또는 5} (하이픈 포함 반환). " +
      "4insure ver: '발 급 번 호' 옆 14자리 숫자(하이픈 없음, 예: '20260513898035'). " +
      "어느 ver이든 존재하는 식별 번호 하나를 그대로 반환. 둘 다 있으면 정부24 우선.",
    birth:
      "주민(외국인)등록번호 앞 6자리(yymmdd). '주민(외국인)등록번호 yymmdd-...' 형태에서 앞 6자리. " +
      "정부24 ver에는 마스킹된 형태로 보이므로 4insure ver의 본문에서만 명시적으로 나옴. 결과는 yymmdd 6자리 숫자.",
  },
  취업지원대상자증명서: {
    passNum:
      "문서확인번호 {4}-{4}-{4}-{4 또는 5}. 하이픈 포함 반환.",
    extraNum:
      "보훈번호. 'NN-NNNNNN' 형태 (예: '93-311381'). 하이픈 포함.",
    birth:
      "'생년월일' 옆 'yyyy년 mm월 dd일' → yyyymmdd 8자리 숫자.",
  },
  수급자증명서: {
    passNum:
      "문서확인번호. 문서 좌측 상단 '문서확인번호' 라벨 뒤에 '1775-0332-6295-3715' 형태. {4}-{4}-{4}-{4 또는 5} 형식. 하이픈 포함 반환.",
    extraNum:
      "발급번호. '제 20260000000021094046 호' 형태로 '수급자 증명서' 제목 근처에 있음. '제'와 '호' 사이 16~22자리 숫자만 추출(공백 제거). 정부24 2차 입력이 발급번호를 요구하는 경우에 사용됨.",
    birth:
      "생년월일(주민번호 앞 6자리 yymmdd). '(생년월일: 1995. 10. 14 )' 형태에서 추출 → yymmdd 6자리. 발급일자(2026...) 같은 최근 날짜와 혼동 금지(1950~2010 범위).",
  },
};

async function gptFillMissing(institution, missingFields, ocrText, note) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};

  const rules = FIELD_RULES[institution];
  if (!rules) return {};

  const targets = missingFields.filter((f) => rules[f]);
  if (targets.length === 0) return {};

  const fieldDescBlock = targets.map((f) => `- ${f}: ${rules[f]}`).join('\n');

  const noteHint = note ? `\n참고(서류 세부 분류): ${note}` : '';

  const userPrompt = `다음은 한국 정부/기관에서 발급한 증명서를 OCR한 텍스트입니다. 서류 종류는 "${institution}"입니다.${noteHint}

다음 항목을 추출해 JSON으로 답하세요. 추출 불가능하면 해당 값은 null.
${fieldDescBlock}

규칙:
- 답변은 JSON 객체 단 한 개. 추가 설명 금지.
- 키 이름은 위에 명시된 필드명 그대로 (${targets.join(', ')}).
- 형식이 명시된 경우 그 형식에 맞춰 변환해서 반환.
- OCR 오류로 인한 글자 오인(0/O, 1/I, l/I 등) 보정 가능하면 보정.

OCR 텍스트:
"""${ocrText}"""`;

  console.log(`[GPT] 보강 시도: ${institution} → [${targets.join(', ')}]`);
  try {
    const res = await axios.post(
      OPENAI_URL,
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: '너는 한국 행정 증명서 OCR 결과에서 핵심 항목을 정확히 추출하는 어시스턴트야. JSON으로만 답해.',
          },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    const content = res.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const out = {};
    for (const f of targets) {
      const v = parsed[f];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        out[f] = String(v).trim();
      }
    }
    console.log(`[GPT] 보강 결과 (${institution}):`, JSON.stringify(out));
    return out;
  } catch (e) {
    console.error(`[GPT] 보강 실패 (${institution}):`, e?.response?.data || e.message);
    return {};
  }
}

function getRequiredFields(institution, note) {
  const rules = FIELD_RULES[institution];
  if (!rules) return [];
  let fields = Object.keys(rules);
  // 국민연금: 정부24면 extraNum/issuedDate 필요 없음
  if (institution === '국민연금가입자증명' && note && note.includes('정부24')) {
    fields = fields.filter((f) => f !== 'extraNum' && f !== 'issuedDate');
  }
  // 4대 사회보험: 정부24 ver이면 birth 필요 없음(마스킹), 4insure ver이면 birth 필요
  if (institution === '4대 사회보험 가입자 가입내역 확인서' && note && note.includes('정부24')) {
    fields = fields.filter((f) => f !== 'birth');
  }
  return fields;
}

module.exports = { gptFillMissing, getRequiredFields };
