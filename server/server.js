require('dotenv').config();
const express = require('express');
const cors = require('cors');
const verifyRoutes = require('./routes/verifyRoutes');
const zipRoutes = require('./routes/zipRoutes'); // ✅ 새로 만들어야 함


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/verify', verifyRoutes);
app.use('/api/zip', zipRoutes);

app.get('/', (req, res) => {
  res.send('🔧 Verification API 서버 실행 중');
});

app.listen(PORT, () => {
  console.log(`✅ 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
