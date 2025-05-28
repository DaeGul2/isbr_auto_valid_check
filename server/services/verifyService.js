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
  const institution = (item.institution || "").trim();

  if (institution === "한국세무사회") {
    await semuVerify(item, delayTime, "한국세무사회");
  } else if (institution === "대한상공회의소") {
    await daehanLoginAndVerify(item, delayTime, "대한상공회의소");
  } else if (institution === "국사편찬위원회") {
    await hanguksaVerify(item, delayTime, "국사편찬위원회");
  } else if (institution === "한국생산성본부") {
    await kpcLicenseVerify(item, delayTime, "한국생산성본부");
  } else if (institution.toLowerCase() === "opic") {
    await opicVerify(item, delayTime);
  } else if (["초본", "성적증명서", "졸업증명서", "등본", "어학성적 사전등록 확인서"].includes(institution)) {
    await govVerify(item, delayTime + 2000, institution);
  } else if (institution === "건강보험자격득실확인서") {
    const passNum = (item.passNum || "").trim();
    if (/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(passNum)) {
      await govVerify(item, delayTime + 2000, institution);
    } else {
      await insuranceNhis(item, delayTime);
    }
  } else if (institution === "국민연금가입자증명") {
    const passNum = (item.passNum || "").trim();
    if (/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(passNum)) {
      await govVerify(item, delayTime + 2000, institution);
    } else {
      await npsVerify(item, delayTime);
    }
  } else {
    throw new Error(`알 수 없는 기관: ${institution}`);
  }

  return item;
};
