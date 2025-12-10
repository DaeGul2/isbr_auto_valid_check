const { daehanLoginAndVerify } = require('../functions/daehan');
const { hanguksaVerify } = require('../functions/hanguksa');
const { kpcLicenseVerify } = require('../functions/kpcLicenseVerify');
const { opicVerify } = require('../functions/opic');
const { semuVerify } = require('../functions/semu');
const { insuranceNhis } = require('../functions/insuranceNhis');
const { govVerify } = require('../functions/gov');
const { npsVerify } = require('../functions/npsVerify');

const delayTime = 3000;

exports.handleVerification = async (item) => {
  const rawInstitution = item.institution || "";
  const cleanedInstitution = rawInstitution.replace(/\s/g, "").trim().toLowerCase();
  const passNum = (item.passNum || "").trim();
  const certificateName = (item.certificateName || "").trim();

  if (cleanedInstitution === "한국세무사회") {
    await semuVerify(item, delayTime, "한국세무사회");
  } else if (cleanedInstitution === "대한상공회의소") {
    await daehanLoginAndVerify(item, delayTime, "대한상공회의소");
  } else if (cleanedInstitution === "국사편찬위원회") {
    await hanguksaVerify(item, delayTime, "국사편찬위원회");
  } else if (cleanedInstitution === "한국생산성본부") {
    await kpcLicenseVerify(item, delayTime, "한국생산성본부");
  } else if (cleanedInstitution === "opic") {
    await opicVerify(item, delayTime);
  } else if (
    ["초본", "성적증명서", "졸업증명서", "등본", "어학성적사전등록확인서"].includes(cleanedInstitution)
  ) {
    await govVerify(item, delayTime + 2000, rawInstitution.trim(), certificateName);
  } else if (cleanedInstitution === "건강보험자격득실확인서") {
    // passNum 조건에 따라 gov / NHIS 분기
    const trimmedPassNum = (passNum || '').toString().trim();

    if (trimmedPassNum) {
      // passNum이 있을 때
      if (trimmedPassNum.startsWith('G')) {
        // G로 시작하면 NHIS 경로
        await insuranceNhis(item, delayTime);
      } else {
        // 그 외는 정부24 경로
        console.log("정부24 경로로 진행합니다.");
        await govVerify(item, delayTime + 2000, rawInstitution.trim());
      }
    } else {
      // passNum이 없으면 기본 NHIS 경로
      await insuranceNhis(item, delayTime);
    }
  } else if (cleanedInstitution === "국민연금가입자증명") {
    // 형식 검증 제거: passNum이 있으면 정부24 경로, 없으면 NPS 경로
    if (passNum) {
      await govVerify(item, delayTime + 2000, rawInstitution.trim());
    } else {
      await npsVerify(item, delayTime);
    }
  } else {
    throw new Error(`알 수 없는 기관: ${rawInstitution}`);
  }

  return item;
};


