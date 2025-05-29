const express = require('express');
const router = express.Router();
const { makeZip } = require('../controllers/verifyController');

router.post('/', makeZip);

module.exports = router;
