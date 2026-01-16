// server/services/verifyService.js

const { daehanLoginAndVerify } = require("../functions/daehan");
const { hanguksaVerifyWithBirth, hanguksaVerifyNoBirth } = require("../functions/hanguksa");
const { kpcLicenseVerify } = require("../functions/kpcLicenseVerify");
const { opicVerify } = require("../functions/opic");
const { semuVerify } = require("../functions/semu");
const { insuranceNhis } = require("../functions/insuranceNhis");
const { govVerify } = require("../functions/gov");
const { npsVerify } = require("../functions/npsVerify");

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
        await govVerify(item, delayTime + 2000, rawInstitution);
      }
    } else {
      await insuranceNhis(item, delayTime);
    }
  } else if (cleanedInstitution === "국민연금가입자증명") {
    if (passNum) {
      await govVerify(item, delayTime + 2000, rawInstitution);
    } else {
      await npsVerify(item, delayTime);
    }
  } else {
    throw new Error(`알 수 없는 기관: ${rawInstitution}`);
  }

  return item;
};
