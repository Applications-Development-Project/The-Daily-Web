/**
 * routes/pageRoutes/userPageRoutes.js
 *
 * The editor's user management page, mounted at "/" in app.js.
 *
 * Owner: OS.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const userController = require('../../controllers/userController');

const router = express.Router();

// Editors only; guests go to /login.
router.get('/editor/users', requireRole('editor'), userController.showUserManagementPage);

module.exports = router;
