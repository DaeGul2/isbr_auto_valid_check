// server/services/verifyService.js

const { daehanLoginAndVerify } = require("../functions/daehan");
const { hanguksaVerifyWithBirth, hanguksaVerifyNoBirth } = require("../functions/hanguksa");
const { kpcLicenseVerify } = require("../functions/kpcLicenseVerify");
const { opicVerify } = require("../functions/opic");
const { semuVerify } = require("../functions/semu");
const { insuranceNhis } = require("../functions/insuranceNhis");
const { govVerify } = require("../functions/gov");
const { govDisabilityVerify } = require("../functions/govDisability");
const { npsVerify } = require("../functions/npsVerify");
const { dataqVerify } = require("../functions/dataq");
const { insurance4InsureVerify } = require("../functions/insurance4Insure");

const delayTime = 3000;

// ✅ 숫자/널/undefined 다 안전하게 문자열로 변환 + trim
function s(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

exports.handleVerification = async (item, options = {}) => {
  const rawInstitution = s(item.institution);
  const cleanedInstitution = rawInstitution.replace(/\s/g, "").trim().toLowerCase();

  // ✅ 여기서 trim 터지던거 해결
  const passNum = s(item.passNum);
  const certificateName = s(item.certificateName);

  const hanguksaMode = s(options.hanguksaMode) || "withBirth";

  if (cleanedInstitution === "한국세무사회") {
    await semuVerify(item, delayTime, "한국세무사회");
  } else if (cleanedInstitution === "대한상공회의소") {
    await daehanLoginAndVerify(item, delayTime, "대한상공회의소");
  } else if (cleanedInstitution === "국사편찬위원회") {
    if (hanguksaMode === "noBirth") {
      await hanguksaVerifyNoBirth(item, delayTime, "국사편찬위원회");
    } else {
      await hanguksaVerifyWithBirth(item, delayTime, "국사편찬위원회");
    }
  } else if (cleanedInstitution === "한국생산성본부") {
    await kpcLicenseVerify(item, delayTime, "한국생산성본부");
  } else if (cleanedInstitution === "opic") {
    await opicVerify(item, delayTime);
  } else if (
    ["초본", "성적증명서", "졸업증명서", "등본", "어학성적사전등록확인서"].includes(cleanedInstitution)
  ) {
    await govVerify(item, delayTime + 2000, rawInstitution, certificateName);
  } else if (cleanedInstitution === "건강보험자격득실확인서") {
    const trimmedPassNum = s(passNum);

    if (trimmedPassNum) {
      if (trimmedPassNum.startsWith("G")) {
        await insuranceNhis(item, delayTime);
      } else {
        console.log("정부24 경로로 진행합니다.");
        await govVerify(item, delayTime + 2000, rawInstitution, certificateName);
      }
    } else {
      await insuranceNhis(item, delayTime);
    }
  } else if (cleanedInstitution.includes("장애인")) {
    await govDisabilityVerify(item, delayTime + 2000, "장애인증명서", certificateName);
  } else if (cleanedInstitution.includes("취업지원")) {
    await govVerify(item, delayTime + 2000, "취업지원대상자증명서", certificateName);
  } else if (cleanedInstitution.includes("수급")) {
    // 국민기초생활수급자(보장시설)증명서(정부24)
    // 2차 입력이 성명/발급번호로 랜덤하게 나오므로 장애인증명서와 동일한 동적분기 함수 사용
    await govDisabilityVerify(item, delayTime + 2000, "수급자증명서", certificateName);
  } else if (cleanedInstitution === "한국데이터산업진흥원" || cleanedInstitution === "한국데이터산업진흥원장") {
    await dataqVerify(item, delayTime, "한국데이터산업진흥원");
  } else if (cleanedInstitution === "국민연금가입자증명") {
    if (passNum) {
      await govVerify(item, delayTime + 2000, rawInstitution);
    } else {
      await npsVerify(item, delayTime);
    }
  } else if (cleanedInstitution.startsWith("4대") || rawInstitution.startsWith("4대")) {
    // 4대 사회보험 가입자 가입내역 확인서
    // 정부24 발급(문서확인번호 4-4-4(5)-4(5)) → govVerify
    // 4insure 발급(14자리 발급번호) → insurance4InsureVerify
    const trimmedPassNum = s(passNum);
    const isGov24Pattern = /^\d{4,5}-\d{4,5}-\d{4,5}-\d{4,5}$/.test(trimmedPassNum);
    if (isGov24Pattern) {
      await govVerify(item, delayTime + 2000, rawInstitution, certificateName);
    } else {
      await insurance4InsureVerify(item, delayTime);
    }
  } else {
    throw new Error(`알 수 없는 기관: ${rawInstitution}`);
  }

  return item;
};
