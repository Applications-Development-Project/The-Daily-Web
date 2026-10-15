/**
 * routes/pageRoutes/authPageRoutes.js
 *
 * The login page and logout, mounted at "/" in app.js. Logout is a page route: the
 * header's plain POST form works without JavaScript, and POST (not GET) means a link or
 * image on another site can't log someone out.
 *
 * Owner: OS.
 */

const express = require('express');
const requireLogin = require('../../middleware/requireLogin');
const authController = require('../../controllers/authController');

const router = express.Router();

router.get('/login', authController.showLoginPage);
router.post('/logout', requireLogin, authController.logOut);

module.exports = router;
