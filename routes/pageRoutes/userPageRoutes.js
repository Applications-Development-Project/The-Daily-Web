/**
 * routes/pageRoutes/userPageRoutes.js
 *
 * Page route for the editor's user management. Mounted at "/" in app.js.
 * Paths and access follow the routes table in "Shared contracts".
 *
 * Owner: OS.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const userController = require('../../controllers/userController');

const router = express.Router();

// Editors only. requireRole also sends guests to /login.
router.get('/editor/users', requireRole('editor'), userController.showUserManagementPage);

module.exports = router;
