const filterEnabledEl = document.getElementById('filterEnabled');
const defaultModeEl = document.getElementById('defaultMode');
const usersListEl = document.getElementById('usersList');
const addUserEl = document.getElementById('addUser');
const saveEl = document.getElementById('save');
const reloadTabEl = document.getElementById('reloadTab');
const userRowTemplate = document.getElementById('userRowTemplate');
const statusEl = document.getElementById('status');

const DEFAULTS = {
  filterEnabled: true,
  defaultMode: 'none',
  users: {}
};

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ff9b9b' : '#8fd18f';
}

function createUserRow(userId = '', mode = 'none') {
  const node = userRowTemplate.content.firstElementChild.cloneNode(true);

  node.querySelector('.user-id').value = userId;
  node.querySelector('.user-mode').value = mode;

  node.querySelector('.remove-user').addEventListener('click', () => {
    node.remove();
  });

  usersListEl.appendChild(node);
}

function collectUsers() {
  const users = {};

  usersListEl.querySelectorAll('.user-row').forEach(row => {
    const userId = row.querySelector('.user-id').value.trim();
    const mode = row.querySelector('.user-mode').value;

    if (userId) {
      users[userId] = mode;
    }
  });

  return users;
}

async function loadSettings() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);

  filterEnabledEl.checked = !!cfg.filterEnabled;
  defaultModeEl.value = cfg.defaultMode === 'images' ? 'images' : 'none';

  usersListEl.innerHTML = '';
  Object.entries(cfg.users || {}).forEach(([userId, mode]) => {
    createUserRow(userId, mode);
  });

  setStatus('Настройки загружены');
}

async function saveSettings() {
  try {
    const cfg = {
      filterEnabled: filterEnabledEl.checked,
      defaultMode: defaultModeEl.value,
      users: collectUsers()
    };

    await chrome.storage.sync.set(cfg);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'settings-updated' });
      } catch {}
    }

    setStatus('Сохранено');
  } catch (err) {
    console.error('[UF popup] saveSettings error:', err);
    setStatus('Ошибка сохранения', true);
  }
}

async function reloadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.reload(tab.id);
  }
}

addUserEl.addEventListener('click', () => createUserRow('', 'none'));
saveEl.addEventListener('click', saveSettings);
reloadTabEl.addEventListener('click', reloadCurrentTab);

loadSettings().catch(err => {
  console.error(err);
  setStatus('Ошибка загрузки', true);
});
