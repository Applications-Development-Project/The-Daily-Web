/**
 * models/User.js
 *
 * Mongoose model for reporters and editors (guests are not stored, they just
 * aren't logged in). Fields follow "Data models" in "Shared contracts":
 * username, passwordHash, displayName, role, plus createdAt/updatedAt timestamps.
 *
 * Security rules built into the model:
 * - Only a bcrypt hash of the password is stored, never the password itself.
 *   A hash can't be turned back into the original password.
 * - passwordHash is never sent to the browser: it is left out of query results
 *   by default (select: false) and removed whenever a user is turned into JSON.
 *
 * Used by: controllers/authController.js (login), controllers/userController.js
 * (user management), scripts/seed.js, and Article.reporter / publishHistory.editor references.
 * Owner: OS.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // The login name. lowercase: true stores "Dana" as "dana", so logging in
    // doesn't depend on capital letters and two users can't be "dana" and "Dana".
    // unique: true makes MongoDB create a unique index; saving a taken username
    // fails with duplicate key error 11000 (errorHandler turns it into 409).
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username can be at most 30 characters'],
    },

    // bcrypt hash of the password (bcrypt also stores the random salt inside it).
    // select: false means find() and findOne() leave this field out unless the
    // query explicitly asks for it with .select('+passwordHash'). Only login does.
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },

    // The name readers see on articles, for example "Dana Levi".
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [50, 'Display name can be at most 50 characters'],
    },

    // Decides what the user may do. Permission checks read the role from the
    // server-side session (copied from here at login), never from the browser.
    // enum rejects any value other than these two.
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
    // Adds createdAt and updatedAt and keeps them up to date automatically.
    timestamps: true,
    toJSON: {
      /**
       * Runs every time a user document is turned into JSON (res.json(user)).
       * select: false only protects documents loaded from the database; a user we
       * just created still has passwordHash in memory, so we also delete it here.
       *
       * @param {mongoose.Document} document - The original Mongoose document.
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
