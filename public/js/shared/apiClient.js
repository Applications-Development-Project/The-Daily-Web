/**
 * public/js/shared/apiClient.js
 *
 * Small helpers around fetch() that every browser script uses to talk to our
 * JSON API (Ajax): apiClient.get, .post, .patch and .delete.
 *
 * Why not call fetch() directly everywhere: fetch() has three different ways to
 * go wrong, and each page would have to handle all of them:
 *   1. The network fails (server down, Wi-Fi off): fetch() rejects with an error.
 *   2. The server answers with an error status (400, 401, 403, 404, 409, 429, 500):
 *      fetch() does NOT reject; we have to check response.ok ourselves.
 *   3. The answer isn't JSON (for example an HTML error page): response.json() throws.
 * These helpers turn all three into the same shape the server already uses,
 * { success: false, error: "<message a user can read>" }, so a page only checks
 * result.success and shows result.error. They never throw and never reject.
 *
 * Every helper resolves to { success, data, error, status }:
 *   success - true if the request worked
 *   data    - the server's "data" on success, otherwise null
 *   error   - a message to show the user on failure, otherwise null
 *   status  - the HTTP status code, or 0 if the server couldn't be reached.
 *             Lets a page react to a specific case, for example 401 (logged out).
 *
 * How to use it: load this file before the page's own script, then call it.
 *   <script src="/js/shared/apiClient.js"></script>
 *   <script src="/js/editorDashboard.js"></script>
 *
 *   const result = await apiClient.post('/api/editor/articles/123/return', { note: 'Fix the title' });
 *   if (!result.success) { showError(result.error); return; }
 *
 * This is a plain browser script (no modules, no build step), so apiClient is a
 * global name that the page scripts loaded after it can use.
 *
 * Used by: every file in public/js/.
 * Owner: shared file, complete version by SM. Change it only in a small, separate pull request.
 */

const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/**
 * Sends one request to our API and turns every possible outcome into
 * { success, data, error, status }.
 *
 * @param {string} method - 'GET', 'POST', 'PATCH' or 'DELETE'.
 * @param {string} url - Path on our server, for example '/api/articles?page=2'.
 * @param {Object} [body] - Data to send as JSON. Leave out for GET and DELETE.
 * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
 *   Never rejects.
 */
async function sendApiRequest(method, url, body) {
  // Accept tells the server we want JSON back, not an HTML page.
  const options = {
    method: method,
    headers: { Accept: 'application/json' },
  };

  // Only requests that carry data get a body and the header saying it is JSON.
  // Without Content-Type: application/json, express.json() would ignore the body.
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  // Case 1: the network fails. fetch() rejects only in this case.
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    return { success: false, data: null, error: NETWORK_ERROR_MESSAGE, status: 0 };
  }

  // Case 3: the answer isn't JSON. response.json() throws, for example on an HTML page.
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

  // Case 2: the server answered with an error. response.ok is true only for 200-299.
  // We also check the body's own "success" flag, so both must agree before we
  // report success.
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

// The four helpers named in "Shared contracts". Each one only picks the HTTP method;
// all the work is in sendApiRequest above. "delete" is allowed as a property name
// even though it is a JavaScript keyword, so apiClient.delete(url) works.
const apiClient = {
  /**
   * Reads data. Put search and filter values in the URL's query string.
   * @param {string} url - For example '/api/editor/articles?status=pending&page=1'.
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  get: function (url) {
    return sendApiRequest('GET', url);
  },

  /**
   * Creates something or runs an action (for example approve).
   * @param {string} url - API path.
   * @param {Object} [body] - Data to send as JSON.
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  post: function (url, body) {
    return sendApiRequest('POST', url, body);
  },

  /**
   * Changes part of something (for example the draft of an article).
   * @param {string} url - API path.
   * @param {Object} body - The fields to change, sent as JSON.
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  patch: function (url, body) {
    return sendApiRequest('PATCH', url, body);
  },

  /**
   * Deletes something.
   * @param {string} url - API path, for example '/api/editor/articles/123'.
   * @returns {Promise<{success: boolean, data: *, error: (string|null), status: number}>}
   */
  delete: function (url) {
    return sendApiRequest('DELETE', url);
  },
};
