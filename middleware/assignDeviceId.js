/**
 * middleware/assignDeviceId.js
 *
 * Gives every browser a long-lived, random device id, so the server can recognise
 * a guest without an account. Every request gets req.deviceId.
 *
 * What uses the device id:
 * - the 3-comments-per-minute limit for guests (middleware/commentRateLimiter.js),
 * - the feed's viewed / not-viewed filter (SH) and recordView (SM).
 *
 * The id lives in a cookie named "deviceId". We read it by parsing the Cookie header
 * ourselves (a small helper below), because the cookie-parser package is not on our
 * allowed list. express-session reads its own cookie, so it doesn't need a parser.
 *
 * Used by: app.js (for every request, before the routers).
 * Owner: OS.
 */

const crypto = require('crypto');

const DEVICE_ID_COOKIE_NAME = 'deviceId';

// One year in milliseconds: the browser keeps the same id for a year.
const DEVICE_ID_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// What a value made by crypto.randomUUID() looks like, for example
// "3b241101-e2bb-4255-8caf-4136c566a962". We accept only this shape, so a cookie
// edited by hand can't put strange text into our database.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds one cookie's value in the raw Cookie header.
 * The header looks like: "deviceId=3b24...; connect.sid=s%3Aabc..."
 * so we split on ";" into "name=value" pairs, then split each pair on its first "="
 * (a value may itself contain "="), and finally undo URL encoding.
 *
 * @param {string|undefined} cookieHeader - req.headers.cookie (undefined if the browser sent none).
 * @param {string} cookieName - The cookie we want.
 * @returns {string|null} The decoded value, or null if the cookie isn't there or is malformed.
 */
function readCookieValue(cookieHeader, cookieName) {
  if (!cookieHeader) {
    return null;
  }

  const cookiePairs = cookieHeader.split(';');
  for (const cookiePair of cookiePairs) {
    const equalsIndex = cookiePair.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const name = cookiePair.slice(0, equalsIndex).trim();
    if (name !== cookieName) {
      continue;
    }

    const encodedValue = cookiePair.slice(equalsIndex + 1).trim();
    try {
      return decodeURIComponent(encodedValue);
    } catch (decodeError) {
      // A broken "%" sequence makes decodeURIComponent throw. A bad cookie must not
      // crash the request; we treat it as missing and a new id is created.
      return null;
    }
  }

  return null;
}

/**
 * Express middleware: sets req.deviceId from the cookie, or creates a new id
 * (and the cookie) the first time a browser visits.
 *
 * @param {import('express').Request} request - Gets request.deviceId.
 * @param {import('express').Response} response - Used to set the cookie for new devices.
 * @param {import('express').NextFunction} next - Continues to the next middleware.
 * @returns {void}
 */
function assignDeviceId(request, response, next) {
  const existingDeviceId = readCookieValue(request.headers.cookie, DEVICE_ID_COOKIE_NAME);

  if (existingDeviceId && UUID_PATTERN.test(existingDeviceId)) {
    request.deviceId = existingDeviceId;
    return next();
  }

  // crypto.randomUUID() is built into Node: 122 random bits, so two browsers
  // never get the same id by chance.
  const newDeviceId = crypto.randomUUID();
  response.cookie(DEVICE_ID_COOKIE_NAME, newDeviceId, {
    // Page scripts can't read or change it; only the server uses it.
    httpOnly: true,
    sameSite: 'lax',
    maxAge: DEVICE_ID_MAX_AGE_MS,
  });
  request.deviceId = newDeviceId;
  next();
}

module.exports = assignDeviceId;
