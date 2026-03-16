require('dotenv').config();
const express = require('express');
const cors = require('cors');
const verifyRoutes = require('./routes/verifyRoutes');
const zipRoutes = require('./routes/zipRoutes');
const logRoutes    = require('./routes/logRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// 요청 타임아웃 설정 (10분 — 대량 검증 대비)
app.use((req, res, next) => {
  req.setTimeout(600000);
  res.setTimeout(600000);
  next();
});

app.use('/api/verify', verifyRoutes);
app.use('/api/log',    logRoutes);
app.use('/api/zip', zipRoutes);

app.get('/', (req, res) => {
  res.send('🔧 Verification API 서버 실행 중');
});

// 글로벌 Express 에러 미들웨어 — 라우트에서 throw된 에러 캐치
app.use((err, req, res, next) => {
  console.error('⚠️ Express 글로벌 에러:', err);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: err.message || '서버 내부 오류' });
  }
});

// uncaughtException / unhandledRejection — 서버 터지지 않게 방어
process.on('uncaughtException', (err) => {
  console.error('🔴 uncaughtException (서버 유지):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('🔴 unhandledRejection (서버 유지):', reason);
});

app.listen(PORT, () => {
  console.log(`✅ 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
