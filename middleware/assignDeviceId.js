/**
 * middleware/assignDeviceId.js
 *
 * Gives every browser a long-lived random id (req.deviceId), so the server recognises a
 * guest without an account: for the 3-comments-per-minute limit, the feed's viewed filter
 * and recordView. A separate cookie from the session, which exists only after login.
 * We parse the Cookie header ourselves, because cookie-parser isn't an allowed package.
 *
 * Used by: app.js (every request, before the routers).
 * Owner: OS.
 */

const crypto = require('crypto');

const DEVICE_ID_COOKIE_NAME = 'deviceId';

// The browser keeps the same id for a year.
const DEVICE_ID_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// The shape of crypto.randomUUID(); only this is accepted, so an edited cookie can't put
// strange text into the database.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds one cookie's value in the raw Cookie header ("deviceId=3b24...; sessionId=s%3A...").
 * Each pair is split on its FIRST "=" (a value may contain "="), then URL-decoded.
 *
 * @param {string|undefined} cookieHeader - req.headers.cookie.
 * @param {string} cookieName - The cookie we want.
 * @returns {string|null} The value, or null if it isn't there or is malformed.
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
      // A broken "%" sequence: treat the cookie as missing instead of crashing.
      return null;
    }
  }

  return null;
}

/**
 * Sets req.deviceId from the cookie, or creates a new id and cookie on the first visit.
 *
 * @param {import('express').Request} request - Gets request.deviceId.
 * @param {import('express').Response} response - Sets the cookie for a new device.
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function assignDeviceId(request, response, next) {
  const existingDeviceId = readCookieValue(request.headers.cookie, DEVICE_ID_COOKIE_NAME);

  if (existingDeviceId && UUID_PATTERN.test(existingDeviceId)) {
    request.deviceId = existingDeviceId;
    return next();
  }

  // 122 random bits: two browsers never get the same id by chance.
  const newDeviceId = crypto.randomUUID();
  response.cookie(DEVICE_ID_COOKIE_NAME, newDeviceId, {
    // Page scripts can't read or change it.
    httpOnly: true,
    // Not sent with requests other websites start.
    sameSite: 'lax',
    maxAge: DEVICE_ID_MAX_AGE_MS,
  });
  request.deviceId = newDeviceId;
  next();
}

module.exports = assignDeviceId;
