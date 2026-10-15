/**
 * routes/apiRoutes/userApiRoutes.js
 *
 * JSON API for user management (full CRUD on User), mounted at "/api" in app.js.
 *
 * Owner: OS.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const userController = require('../../controllers/userController');

const router = express.Router();

// Editors only (guests get 401, reporters 403).
router.get('/users', requireRole('editor'), userController.searchUsers);
router.post('/users', requireRole('editor'), userController.createUser);
router.patch('/users/:id', requireRole('editor'), userController.updateUser);
router.delete('/users/:id', requireRole('editor'), userController.deleteUser);

module.exports = router;
