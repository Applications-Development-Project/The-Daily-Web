/**
 * public/js/shared/apiClient.js
 *
 * Helpers around fetch() for every browser script: apiClient.get, .post, .patch, .delete.
 * fetch() can fail in three ways (the network fails and it rejects; the server answers an
 * error status and it does NOT reject; the answer isn't JSON and response.json() throws).
 * These helpers turn all three into one shape and never throw:
 * { success, data, error, status }, where status is 0 if the server couldn't be reached.
 *
 * A plain browser script (no modules): load it before the page's own script, which then
 * uses the global apiClient.
 *
 * Used by: every file in public/js/.
 * Owner: shared file, complete version by SM.
 */

const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/**
 * Sends one request and turns every outcome into { success, data, error, status }.
 *
 * @param {string} method - 'GET', 'POST', 'PATCH' or 'DELETE'.
 * @param {string} url - For example '/api/articles?page=2'.
 * @param {Object} [body] - Sent as JSON; left out for GET and DELETE.
 * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
 *   Never rejects.
 */
async function sendApiRequest(method, url, body) {
  // Accept: we want JSON back, not an HTML page.
  const options = {
    method: method,
    headers: { Accept: 'application/json' },
  };

  // Without Content-Type: application/json, express.json() would ignore the body.
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  // The network fails: the only case where fetch() rejects.
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    return { success: false, data: null, error: NETWORK_ERROR_MESSAGE, status: 0 };
  }

  // The answer isn't JSON (for example an HTML page).
  let responseBody;
  try {
    responseBody = await response.json();
  } catch (parseError) {
    return {
      success: false,
      data: null,
      error: `Unexpected answer from the server (status ${response.status}). Please try again.`,
      status: response.status,
    };
  }

  // An error status (response.ok is true only for 200-299); the body's own flag must agree too.
  if (!response.ok || responseBody.success !== true) {
    return {
      success: false,
      data: null,
      error: responseBody.error || `Request failed (status ${response.status}).`,
      status: response.status,
    };
  }

  return { success: true, data: responseBody.data, error: null, status: response.status };
}

// Each helper only picks the method. "delete" is allowed as a property name.
const apiClient = {
  /**
   * Reads data (filters go in the query string).
   * @param {string} url
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  get: function (url) {
    return sendApiRequest('GET', url);
  },

  /**
   * Creates something or runs an action (for example approve).
   * @param {string} url
   * @param {Object} [body]
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  post: function (url, body) {
    return sendApiRequest('POST', url, body);
  },

  /**
   * Changes part of something.
   * @param {string} url
   * @param {Object} body - The fields to change.
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  patch: function (url, body) {
    return sendApiRequest('PATCH', url, body);
  },

  /**
   * Deletes something.
   * @param {string} url
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  delete: function (url) {
    return sendApiRequest('DELETE', url);
  },
};
