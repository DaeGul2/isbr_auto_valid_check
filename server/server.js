require('dotenv').config();
const express = require('express');
const cors = require('cors');
const verifyRoutes = require('./routes/verifyRoutes');
const zipRoutes = require('./routes/zipRoutes');
const logRoutes    = require('./routes/logRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/verify', verifyRoutes);
app.use('/api/log',    logRoutes);
app.use('/api/zip', zipRoutes);

app.get('/', (req, res) => {
  res.send('🔧 Verification API 서버 실행 중');
});

// ✅ Express 글로벌 에러 미들웨어 — 라우트에서 throw된 에러가 여기서 잡힘
app.use((err, req, res, next) => {
  console.error('⚠️ Express 글로벌 에러:', err);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// ✅ 프로세스 레벨 에러 핸들러 — 잡히지 않은 에러로 서버가 죽는 것 방지
process.on('uncaughtException', (err) => {
  console.error('🔴 uncaughtException — 서버 크래시 방지됨:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('🔴 unhandledRejection — 서버 크래시 방지됨:', reason);
});

app.listen(PORT, () => {
  console.log(`✅ 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
