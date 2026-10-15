/**
 * routes/apiRoutes/authApiRoutes.js
 *
 * POST /api/auth/login (mounted at "/api" in app.js); the login page sends it with fetch.
 *
 * Owner: OS.
 */

const express = require('express');
const authController = require('../../controllers/authController');

const router = express.Router();

// Open to everyone: you can't be logged in before logging in.
router.post('/auth/login', authController.logIn);

module.exports = router;
