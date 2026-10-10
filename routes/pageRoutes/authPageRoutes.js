/**
 * routes/pageRoutes/authPageRoutes.js
 *
 * Page routes for logging in and out. Mounted at "/" in app.js.
 * Paths and access follow the routes table in "Shared contracts".
 *
 * Logout is a page route (not /api) on purpose: the header logs out with a plain
 * HTML form, <form method="post" action="/logout">, so it works on every page even
 * with JavaScript turned off. POST, not GET, so a link or an image on another site
 * can't log someone out just by being loaded.
 *
 * Owner: OS.
 */

const express = require('express');
const requireLogin = require('../../middleware/requireLogin');
const authController = require('../../controllers/authController');

const router = express.Router();

// Open to everyone: guests need the login page.
router.get('/login', authController.showLoginPage);

// Logged-in users only, as in the routes table.
router.post('/logout', requireLogin, authController.logOut);

module.exports = router;
