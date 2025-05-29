// server/routes/logRoutes.js
const express = require('express');
const router  = express.Router();
const { sendBatchLog } = require('../controllers/logController');

router.post('/', sendBatchLog);

module.exports = router;
