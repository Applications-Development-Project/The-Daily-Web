/**
 * public/js/userManagement.js
 *
 * Runs the editor's user management page (views/editor/users.ejs). Everything happens
 * with Ajax through apiClient, so the page never reloads:
 * - the table shows 20 users at a time from GET /api/users, with Previous/Next buttons,
 * - typing in the search box filters the table (300 ms after the last key),
 * - the "Add a user" form sends POST /api/users,
 * - Edit turns a row into a small form (display name, role, new password) that sends
 *   PATCH /api/users/:id with only the fields that changed,
 * - Delete asks for confirmation, then sends DELETE /api/users/:id.
 * The server checks everything again (editor only, field rules, the 409 safety rules);
 * this script only shows its answers.
 *
 * Every value from the server is put on the page with textContent or .value, never
 * innerHTML, so a display name containing HTML can't change the page.
 *
 * Load after apiClient.js. Owner: OS.
 */

// How long to wait after the last key in the search box before searching, so typing
// "maya" sends one request instead of four.
const SEARCH_DELAY_MS = 300;

const ROLE_LABELS = { reporter: 'Reporter', editor: 'Editor' };

/**
 * Creates an element with optional text, as plain text.
 *
 * @param {string} tagName - For example 'td'.
 * @param {string} [text] - Text content.
 * @returns {HTMLElement}
 */
function createElementWithText(tagName, text) {
  const element = document.createElement(tagName);
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

/**
 * Creates a button.
 *
 * @param {string} label - The button text.
 * @param {string} className - CSS classes, for example 'btn btn-danger'.
 * @returns {HTMLButtonElement}
 */
function createButton(label, className) {
  const button = createElementWithText('button', label);
  button.type = 'button';
  button.className = className;
  return button;
}

/**
 * Formats a date like "10 Oct 2026".
 *
 * @param {string} isoDate - A date from the API.
 * @returns {string}
 */
function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Connects the whole page. The functions inside share the page's state (current page,
 * search text) and elements without making them global.
 *
 * @returns {void}
 */
function setUpUserManagement() {
  const pageRoot = document.getElementById('user-management');
  if (!pageRoot) {
    return;
  }

  const currentUserId = pageRoot.dataset.currentUserId;
  const tableBody = document.getElementById('user-table-body');
  const listStatus = document.getElementById('user-list-status');
  const listError = document.getElementById('user-list-error');
  const searchInput = document.getElementById('user-search');
  const searchForm = document.getElementById('user-search-form');
  const previousButton = document.getElementById('previous-page');
  const nextButton = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');
  const addForm = document.getElementById('add-user-form');
  const addMessage = document.getElementById('add-user-message');

  let currentPage = 1;
  let totalPages = 1;
  let searchTimer = null;

  /**
   * Shows an error above the table, or hides it when message is empty.
   *
   * @param {string} message - The text to show, or '' to hide.
   * @returns {void}
   */
  function showListError(message) {
    listError.textContent = message;
    listError.hidden = message === '';
  }

  /**
   * Loads one page of users from the API and shows it.
   *
   * @returns {Promise<void>}
   */
  async function loadUsers() {
    listStatus.textContent = 'Loading users...';
    listStatus.hidden = false;

    // URLSearchParams encodes the search text, so characters like & or # are safe.
    const query = new URLSearchParams({ page: String(currentPage) });
    if (searchInput.value.trim() !== '') {
      query.set('search', searchInput.value.trim());
    }
    const result = await apiClient.get(`/api/users?${query.toString()}`);

    if (!result.success) {
      listStatus.hidden = true;
      showListError(result.error);
      return;
    }

    showListError('');
    totalPages = result.data.totalPages;
    tableBody.replaceChildren(...result.data.users.map(createUserRow));

    if (result.data.users.length === 0) {
      listStatus.textContent = 'No users match your search.';
    } else {
      listStatus.hidden = true;
    }
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
  }

  /**
   * Builds the normal (not editing) table row for one user.
   *
   * @param {{id: string, username: string, displayName: string, role: string, createdAt: string}} user
   * @returns {HTMLTableRowElement}
   */
  function createUserRow(user) {
    const row = document.createElement('tr');
    row.append(
      createElementWithText('td', user.username),
      createElementWithText('td', user.displayName),
      createElementWithText('td', ROLE_LABELS[user.role]),
      createElementWithText('td', formatDate(user.createdAt))
    );

    const actions = document.createElement('td');
    const editButton = createButton('Edit', 'btn');
    const deleteButton = createButton('Delete', 'btn btn-danger');
    editButton.addEventListener('click', () => row.replaceWith(createEditRow(user)));
    deleteButton.addEventListener('click', () => deleteUser(user));
    if (user.id === currentUserId) {
      deleteButton.disabled = true;
      deleteButton.title = "You can't delete your own account.";
    }
    actions.append(editButton, ' ', deleteButton);
    row.append(actions);
    return row;
  }

  /**
   * Builds the editing version of a row: inputs for display name, role and a new
   * password, with Save and Cancel. The username can't be changed.
   *
   * @param {{id: string, username: string, displayName: string, role: string, createdAt: string}} user
   * @returns {HTMLTableRowElement}
   */
  function createEditRow(user) {
    const row = document.createElement('tr');

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 50;
    nameInput.value = user.displayName;
    nameInput.setAttribute('aria-label', `Display name of ${user.username}`);

    const roleSelect = document.createElement('select');
    roleSelect.setAttribute('aria-label', `Role of ${user.username}`);
    for (const role of Object.keys(ROLE_LABELS)) {
      const option = createElementWithText('option', ROLE_LABELS[role]);
      option.value = role;
      option.selected = role === user.role;
      roleSelect.append(option);
    }

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.autocomplete = 'new-password';
    passwordInput.placeholder = 'New password (optional)';
    passwordInput.setAttribute('aria-label', `New password for ${user.username}`);

    const nameCell = document.createElement('td');
    nameCell.append(nameInput);
    const roleCell = document.createElement('td');
    roleCell.append(roleSelect);
    const passwordCell = document.createElement('td');
    passwordCell.append(passwordInput);

    const actions = document.createElement('td');
    const saveButton = createButton('Save', 'btn btn-primary');
    const cancelButton = createButton('Cancel', 'btn');
    cancelButton.addEventListener('click', () => row.replaceWith(createUserRow(user)));
    saveButton.addEventListener('click', () => saveUser(user, row, saveButton, {
      displayName: nameInput.value.trim(),
      role: roleSelect.value,
      password: passwordInput.value,
    }));
    actions.append(saveButton, ' ', cancelButton);

    row.append(createElementWithText('td', user.username), nameCell, roleCell, passwordCell, actions);
    return row;
  }

  /**
   * Sends only the fields that changed. On success the row goes back to normal with
   * the server's version of the user; on failure the row stays in edit mode and the
   * server's message (for example a 409 safety rule) is shown above the table.
   *
   * @param {Object} user - The user before editing.
   * @param {HTMLTableRowElement} row - The editing row.
   * @param {HTMLButtonElement} saveButton - Disabled while saving.
   * @param {{displayName: string, role: string, password: string}} values - The inputs.
   * @returns {Promise<void>}
   */
  async function saveUser(user, row, saveButton, values) {
    const changes = {};
    if (values.displayName !== user.displayName) {
      changes.displayName = values.displayName;
    }
    if (values.role !== user.role) {
      changes.role = values.role;
    }
    if (values.password !== '') {
      changes.password = values.password;
    }
    if (Object.keys(changes).length === 0) {
      row.replaceWith(createUserRow(user));
      return;
    }

    saveButton.disabled = true;
    const result = await apiClient.patch(`/api/users/${encodeURIComponent(user.id)}`, changes);
    saveButton.disabled = false;

    if (!result.success) {
      showListError(result.error);
      return;
    }
    showListError('');
    row.replaceWith(createUserRow(result.data));
  }

  /**
   * Asks for confirmation, deletes the user, then reloads the current page of the
   * list (so the page stays full and the page count stays right).
   *
   * @param {Object} user - The user to delete.
   * @returns {Promise<void>}
   */
  async function deleteUser(user) {
    // confirm() is the browser's own yes/no box; deleting can't be undone.
    if (!window.confirm(`Delete the user "${user.username}"? This can't be undone.`)) {
      return;
    }

    const result = await apiClient.delete(`/api/users/${encodeURIComponent(user.id)}`);
    if (!result.success) {
      showListError(result.error);
      return;
    }
    await loadUsers();
    // If that was the last user on the last page, step back one page.
    if (tableBody.children.length === 0 && currentPage > 1) {
      currentPage -= 1;
      await loadUsers();
    }
  }

  /**
   * Sends the "Add a user" form. On success the form is cleared and the list reloaded.
   *
   * @param {SubmitEvent} event - The form's submit event.
   * @returns {Promise<void>}
   */
  async function addUser(event) {
    event.preventDefault();
    const submitButton = addForm.querySelector('[type="submit"]');
    submitButton.disabled = true;

    const result = await apiClient.post('/api/users', {
      username: addForm.elements.username.value.trim(),
      displayName: addForm.elements.displayName.value.trim(),
      role: addForm.elements.role.value,
      password: addForm.elements.password.value,
    });
    submitButton.disabled = false;

    addMessage.hidden = false;
    if (!result.success) {
      addMessage.className = 'form-error';
      addMessage.textContent = result.error;
      return;
    }
    addMessage.className = '';
    addMessage.textContent = `Added ${result.data.username}.`;
    addForm.reset();
    await loadUsers();
  }

  // Search: wait until the editor stops typing, then start again from page 1.
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      loadUsers();
    }, SEARCH_DELAY_MS);
  });
  // Pressing Enter in the search box must not reload the page.
  searchForm.addEventListener('submit', (event) => event.preventDefault());

  previousButton.addEventListener('click', () => {
    currentPage -= 1;
    loadUsers();
  });
  nextButton.addEventListener('click', () => {
    currentPage += 1;
    loadUsers();
  });
  addForm.addEventListener('submit', addUser);

  loadUsers();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpUserManagement);
} else {
  setUpUserManagement();
}
