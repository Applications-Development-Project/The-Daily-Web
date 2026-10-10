/**
 * routes/apiRoutes/authApiRoutes.js
 *
 * JSON API route for logging in. Mounted at "/api" in app.js, so "/auth/login"
 * here is "/api/auth/login" in the browser. The login page sends the form with fetch.
 * Paths and access follow the routes table in "Shared contracts".
 *
 * Owner: OS.
 */

const express = require('express');
const authController = require('../../controllers/authController');

const router = express.Router();

// Open to everyone: you can't be logged in before logging in.
router.post('/auth/login', authController.logIn);

module.exports = router;
