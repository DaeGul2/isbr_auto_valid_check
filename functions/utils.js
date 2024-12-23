// utils.js
const path = require('path');

// 공통 경로 생성 함수
function getResultScreenshotPath(screenshotDir, item) {
  return path.join(screenshotDir, `${item.registerationNumber}_${item.name}_${item.certificateName}.png`);
}

module.exports = { getResultScreenshotPath };
