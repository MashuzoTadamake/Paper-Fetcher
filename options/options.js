/**
 * Paper Fetcher - Settings / Options Controller
 */

import { DEFAULT_MIRRORS, pingMirror, fetchLiveMirrors } from '../lib/scihub-resolver.js';

const DEFAULTS = {
  autoBadge: true
};

const prefAutoBadge = document.getElementById('pref-auto-badge');
const btnCheckAllMirrors = document.getElementById('btn-check-all-mirrors');
const mirrorStatusList = document.getElementById('mirror-status-list');
const btnSave = document.getElementById('btn-save');
const saveStatus = document.getElementById('save-status');

/**
 * Loads settings from chrome.storage.sync
 */
async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  prefAutoBadge.checked = settings.autoBadge !== false;
  renderMirrorsStatus();
}

/**
 * Checks and renders live status for all mirrors
 */
async function renderMirrorsStatus() {
  mirrorStatusList.innerHTML = '<span class="hint">Testing live Sci-Hub mirrors...</span>';
  
  let mirrors = DEFAULT_MIRRORS;
  try {
    const live = await fetchLiveMirrors();
    if (live && live.length > 0) mirrors = live;
  } catch (e) {}

  mirrorStatusList.innerHTML = '';

  for (const m of mirrors) {
    const row = document.createElement('div');
    row.className = 'mirror-row';
    row.innerHTML = `
      <span class="mirror-url">${m}</span>
      <span class="mirror-tag">Checking...</span>
    `;
    mirrorStatusList.appendChild(row);

    pingMirror(m, 3000).then((isAlive) => {
      const tag = row.querySelector('.mirror-tag');
      if (isAlive) {
        tag.className = 'mirror-tag online';
        tag.textContent = 'Active ✅';
      } else {
        tag.className = 'mirror-tag offline';
        tag.textContent = 'Unreachable ❌';
      }
    });
  }
}

/**
 * Saves settings to chrome.storage.sync
 */
async function saveSettings() {
  const autoBadge = prefAutoBadge.checked;
  await chrome.storage.sync.set({ autoBadge });
  saveStatus.textContent = 'Settings saved successfully!';
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 2500);
}

btnCheckAllMirrors.addEventListener('click', renderMirrorsStatus);
btnSave.addEventListener('click', saveSettings);

document.addEventListener('DOMContentLoaded', loadSettings);
