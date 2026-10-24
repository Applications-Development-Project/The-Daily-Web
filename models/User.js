/**
 * models/User.js
 *
 * Reporters and editors (guests aren't stored). Only a bcrypt hash of the password is
 * kept, which can't be turned back into the password, and it is never sent to the
 * browser (select: false, and removed in toJSON).
 *
 * Used by: controllers/authController.js, controllers/userController.js, scripts/seed.js.
 * Owner: OS.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // lowercase: "Dana" and "dana" are the same user. unique creates a unique index, so the
    // DATABASE refuses a taken name (error 11000, answered 409), even for two requests at once.
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username can be at most 30 characters'],
    },

    // bcrypt adds a random salt, so equal passwords get different hashes. select: false:
    // left out of every query unless asked for with .select('+passwordHash') (only login).
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },

    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [50, 'Display name can be at most 50 characters'],
    },

    // Copied into the session at login and reloaded every request (setCurrentUser.js).
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['reporter', 'editor'],
        message: 'Role must be "reporter" or "editor"',
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      /**
       * Runs when a user is turned into JSON. select: false protects only loaded
       * documents; a user just created still has passwordHash in memory.
       *
       * @param {mongoose.Document} document - The Mongoose document.
       * @param {Object} jsonObject - The plain object that will be sent.
       * @returns {Object} The object without passwordHash.
       */
      transform(document, jsonObject) {
        delete jsonObject.passwordHash;
        return jsonObject;
      },
    },
  }
);

module.exports = mongoose.model('User', userSchema);
