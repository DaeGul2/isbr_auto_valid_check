const express = require('express');
const router = express.Router();
const { ocrParse, ocrParseExcel } = require('../controllers/ocrParseController');

router.post('/parse', ocrParse);
router.post('/excel', ocrParseExcel);

module.exports = router;
