/**
 * Paper Fetcher - Popup Controller (Direct PDF Downloader)
 */

import { pingMirror, fetchLiveMirrors, DEFAULT_MIRRORS } from '../lib/scihub-resolver.js';

let currentMetadata = null;
let currentTab = null;
let resolvedPdfUrl = null;

// Views
const mainContent = document.getElementById('main-content');
const viewSettings = document.getElementById('view-settings');
const mainFooter = document.getElementById('main-footer');
const statusChip = document.getElementById('status-chip');
const statusText = document.getElementById('status-text');
const mirrorSubtitle = document.getElementById('mirror-subtitle');

// Paper Card Elements
const stateLoading = document.getElementById('state-loading');
const stateFound = document.getElementById('state-found');
const stateNotFound = document.getElementById('state-not-found');

const paperTitle = document.getElementById('paper-title');
const paperAuthors = document.getElementById('paper-authors');
const paperJournal = document.getElementById('paper-journal');
const paperYear = document.getElementById('paper-year');
const paperVolume = document.getElementById('paper-volume');
const paperDoi = document.getElementById('paper-doi');
const scihubStatusTag = document.getElementById('scihub-status-tag');
const paywallBanner = document.getElementById('paywall-banner');
const linkDirectPdf = document.getElementById('link-direct-pdf');

// Buttons
const btnDownloadPdf = document.getElementById('btn-download-pdf');
const btnScihub = document.getElementById('btn-scihub');
const btnCopyDoi = document.getElementById('btn-copy-doi');
const btnSettings = document.getElementById('btn-settings');
const btnRescan = document.getElementById('btn-rescan');
const btnManualGo = document.getElementById('btn-manual-go');
const manualDoiInput = document.getElementById('manual-doi-input');

// Settings in-popup Elements
const btnBackFromSettings = document.getElementById('btn-back-from-settings');
const btnSaveInPopup = document.getElementById('btn-save-in-popup');
const popupPrefBadge = document.getElementById('popup-pref-badge');
const btnPopupCheckMirrors = document.getElementById('btn-popup-check-mirrors');
const popupMirrorsList = document.getElementById('popup-mirrors-list');

// Notices
const scihubNoticeBanner = document.getElementById('scihub-notice-banner');
const scihubNoticeText = document.getElementById('scihub-notice-text');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

/**
 * Shows temporary toast notification
 */
function showToast(msg, duration = 3000) {
  toastMessage.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

/**
 * Updates UI state view (loading, found, not-found)
 */
function setViewState(view) {
  stateLoading.classList.add('hidden');
  stateFound.classList.add('hidden');
  stateNotFound.classList.add('hidden');

  if (view === 'loading') {
    stateLoading.classList.remove('hidden');
    statusChip.className = 'status-chip chip-loading';
    statusText.textContent = 'Scanning page...';
  } else if (view === 'found') {
    stateFound.classList.remove('hidden');
    if (currentMetadata?.isPaywalled) {
      statusChip.className = 'status-chip chip-paywall';
      statusText.textContent = 'Paywalled Paper';
    } else {
      statusChip.className = 'status-chip chip-success';
      statusText.textContent = 'Paper Detected';
    }
  } else {
    stateNotFound.classList.remove('hidden');
    statusChip.className = 'status-chip chip-empty';
    statusText.textContent = 'No Paper Found';
  }
}

/**
 * Populates paper details into the found view
 */
function renderMetadata(meta) {
  currentMetadata = meta;
  resolvedPdfUrl = null;
  scihubNoticeBanner.classList.add('hidden');

  if (!meta || (!meta.doi && !meta.title && !meta.pii)) {
    setViewState('not-found');
    return;
  }

  paperTitle.textContent = meta.title || 'Untitled Academic Document';

  // Format authors
  if (Array.isArray(meta.authors) && meta.authors.length > 0) {
    if (meta.authors.length <= 3) {
      paperAuthors.textContent = meta.authors.join(', ');
    } else {
      paperAuthors.textContent = `${meta.authors.slice(0, 3).join(', ')} et al. (${meta.authors.length} authors)`;
    }
  } else if (typeof meta.authors === 'string') {
    paperAuthors.textContent = meta.authors;
  } else {
    paperAuthors.textContent = 'Unknown Authors';
  }

  // Journal
  if (meta.journal) {
    paperJournal.textContent = meta.journal;
    document.getElementById('row-journal').classList.remove('hidden');
  } else {
    document.getElementById('row-journal').classList.add('hidden');
  }

  // Year & Volume tags
  if (meta.date) {
    const yearMatch = meta.date.match(/\b(19\d\d|20\d\d)\b/);
    paperYear.textContent = yearMatch ? yearMatch[1] : meta.date;
    paperYear.classList.remove('hidden');
  } else {
    paperYear.classList.add('hidden');
  }

  if (meta.volume) {
    paperVolume.textContent = `Vol. ${meta.volume}${meta.issue ? ` (${meta.issue})` : ''}`;
    paperVolume.classList.remove('hidden');
  } else {
    paperVolume.classList.add('hidden');
  }

  // Identifier (DOI or ScienceDirect PII)
  const identifier = meta.doi || meta.pii;
  if (identifier) {
    paperDoi.textContent = identifier;
    btnScihub.disabled = false;

    // Reset status tag to checking and temporarily disable download button while probing
    scihubStatusTag.className = 'tag tag-checking';
    scihubStatusTag.textContent = '⏳ Checking Sci-Hub...';
    btnDownloadPdf.disabled = true;
    btnDownloadPdf.innerHTML = '<span class="btn-icon">⏳</span><span>Checking Sci-Hub...</span>';

    // Probe Sci-Hub availability in background
    checkSciHubAvailability(identifier);
  } else {
    paperDoi.textContent = 'Using article URL to query Sci-Hub';
    scihubStatusTag.className = 'tag tag-unavailable';
    scihubStatusTag.textContent = '❌ No DOI found';
    btnDownloadPdf.disabled = true;
    btnDownloadPdf.innerHTML = '<span class="btn-icon">❌</span><span>No DOI Detected</span>';
  }

  // Paywall alert
  if (meta.isPaywalled) {
    paywallBanner.classList.remove('hidden');
  } else {
    paywallBanner.classList.add('hidden');
  }

  // Direct publisher PDF link if paper is NOT paywalled (e.g. arXiv / Open Access)
  if (!meta.isPaywalled && meta.pdfUrl) {
    linkDirectPdf.href = meta.pdfUrl;
    linkDirectPdf.classList.remove('hidden');
  } else {
    linkDirectPdf.classList.add('hidden');
  }

  setViewState('found');
}

/**
 * Checks in background if Sci-Hub has the PDF
 */
async function checkSciHubAvailability(doi) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'CHECK_SCIHUB_PDF', doi });
    
    if (res && res.available && res.pdfUrl) {
      // Paper EXISTS on Sci-Hub!
      resolvedPdfUrl = res.pdfUrl;
      scihubStatusTag.className = 'tag tag-available';
      scihubStatusTag.textContent = '✅ PDF Available on Sci-Hub';
      
      btnDownloadPdf.disabled = false;
      btnDownloadPdf.innerHTML = '<span class="btn-icon">📥</span><span>Download PDF</span>';
      scihubNoticeBanner.classList.add('hidden');

      if (res.mirror) {
        const domain = res.mirror.replace(/^https?:\/\//, '');
        mirrorSubtitle.textContent = `Sci-Hub (${domain} live)`;
      }
    } else {
      // Paper DOES NOT EXIST on Sci-Hub!
      resolvedPdfUrl = null;
      scihubStatusTag.className = 'tag tag-unavailable';
      scihubStatusTag.textContent = '❌ Not on Sci-Hub :3';

      btnDownloadPdf.disabled = true;
      btnDownloadPdf.title = 'Direct PDF download is disabled because this paper has not been archived on Sci-Hub yet.';
      btnDownloadPdf.innerHTML = '<span class="btn-icon">🚫</span><span>Not on Sci-Hub :3</span>';

      scihubNoticeBanner.classList.remove('hidden');
      scihubNoticeText.textContent = 'still not available on sci-hub :3';
    }
  } catch (e) {
    scihubStatusTag.className = 'tag tag-unavailable';
    scihubStatusTag.textContent = '❌ Not on Sci-Hub :3';
    btnDownloadPdf.disabled = true;
    btnDownloadPdf.innerHTML = '<span class="btn-icon">🚫</span><span>Not on Sci-Hub :3</span>';
    scihubNoticeBanner.classList.remove('hidden');
    scihubNoticeText.textContent = 'still not available on sci-hub :3';
  }
}

/**
 * Retrieves metadata from active tab content script
 */
async function loadPageMetadata() {
  setViewState('loading');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];

    if (!currentTab || !currentTab.id || !currentTab.url || currentTab.url.startsWith('chrome://')) {
      setViewState('not-found');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'GET_PAPER_METADATA' });
      if (response && response.metadata && response.metadata.found) {
        renderMetadata(response.metadata);
        return;
      }
    } catch (err) {
      // Content script injection fallback
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content/extractors.js', 'content/content.js']
      });

      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'GET_PAPER_METADATA' });
      if (response && response.metadata && response.metadata.found) {
        renderMetadata(response.metadata);
        return;
      }
    }

    setViewState('not-found');
  } catch (err) {
    setViewState('not-found');
  }
}

// 1. Direct Download PDF to PC
btnDownloadPdf.addEventListener('click', async () => {
  if (!currentMetadata) return;

  // Strict check: if not resolved, do not proceed or download HTML
  if (!resolvedPdfUrl) {
    showToast('still not available on sci-hub :3');
    scihubNoticeBanner.classList.remove('hidden');
    return;
  }

  btnDownloadPdf.disabled = true;
  const originalHtml = btnDownloadPdf.innerHTML;
  btnDownloadPdf.innerHTML = '<span class="btn-icon">⏳</span><span>Downloading...</span>';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'DOWNLOAD_PDF',
      metadata: currentMetadata
    });

    if (res && res.success) {
      showToast(`Downloading: ${res.filename || 'paper.pdf'}`);
      btnDownloadPdf.innerHTML = '<span class="btn-icon">✅</span><span>Downloading!</span>';

      setTimeout(() => {
        btnDownloadPdf.disabled = false;
        btnDownloadPdf.innerHTML = originalHtml;
      }, 3000);
    } else {
      scihubNoticeText.textContent = res?.message || 'still not available on sci-hub :3';
      scihubNoticeBanner.classList.remove('hidden');
      showToast(res?.message || 'still not available on sci-hub :3');
      btnDownloadPdf.disabled = true;
      btnDownloadPdf.innerHTML = '<span class="btn-icon">❌</span><span>Not on Sci-Hub :3</span>';
    }
  } catch (err) {
    showToast('Download error: ' + err.message);
    btnDownloadPdf.disabled = false;
    btnDownloadPdf.innerHTML = originalHtml;
  }
});

// 2. Open on Sci-Hub
btnScihub.addEventListener('click', async () => {
  if (!currentMetadata) return;

  btnScihub.disabled = true;
  const originalHtml = btnScihub.innerHTML;
  btnScihub.innerHTML = '<span class="btn-icon">⏳</span><span>Opening...</span>';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'OPEN_SCIHUB',
      doi: currentMetadata.doi || currentMetadata.pii,
      url: currentMetadata.url
    });

    if (res && res.success) {
      showToast(`Opened on ${res.mirror || 'Sci-Hub'}`);
    } else {
      showToast(res?.error || 'Failed to open Sci-Hub');
    }
  } catch (err) {
    showToast('Error opening Sci-Hub');
  } finally {
    btnScihub.disabled = false;
    btnScihub.innerHTML = originalHtml;
  }
});

// Copy DOI
btnCopyDoi.addEventListener('click', () => {
  const val = currentMetadata?.doi || currentMetadata?.pii;
  if (!val) return;
  navigator.clipboard.writeText(val).then(() => {
    showToast('Identifier copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy');
  });
});

// Click title to copy
paperTitle.addEventListener('click', () => {
  if (!paperTitle.textContent) return;
  navigator.clipboard.writeText(paperTitle.textContent).then(() => {
    showToast('Title copied to clipboard!');
  });
});

// Rescan button
btnRescan.addEventListener('click', () => {
  loadPageMetadata();
});

// Manual input (DOI, PII, or ScienceDirect URL)
btnManualGo.addEventListener('click', () => {
  const rawInput = manualDoiInput.value.trim();
  if (!rawInput) {
    showToast('Please enter a valid DOI or ScienceDirect URL');
    return;
  }

  const match = rawInput.match(/10\.\d{4,9}\/[-._;()/:<>+=A-Za-z0-9]+/);
  const piiMatch = rawInput.match(/S[0-9A-Za-z]{10,}/i);
  const identifier = match ? match[0] : (piiMatch ? piiMatch[0] : rawInput);

  const manualMeta = {
    found: true,
    doi: identifier,
    title: `Academic Paper (${identifier})`,
    authors: ['Manual Entry'],
    journal: 'Scientific Publication',
    url: rawInput.startsWith('http') ? rawInput : `https://doi.org/${identifier}`
  };

  renderMetadata(manualMeta);
});

// ==========================================
// In-Popup Settings View Handlers
// ==========================================

async function openSettingsView() {
  mainContent.classList.add('hidden');
  statusChip.classList.add('hidden');
  mainFooter.classList.add('hidden');
  viewSettings.classList.remove('hidden');

  const settings = await chrome.storage.sync.get({ autoBadge: true });
  popupPrefBadge.checked = settings.autoBadge !== false;

  renderPopupMirrors();
}

async function closeSettingsView(shouldSave = true) {
  if (shouldSave) {
    const autoBadge = popupPrefBadge.checked;
    await chrome.storage.sync.set({ autoBadge });
    showToast('Settings saved!');
  }

  viewSettings.classList.add('hidden');
  mainContent.classList.remove('hidden');
  statusChip.classList.remove('hidden');
  mainFooter.classList.remove('hidden');
}

async function renderPopupMirrors() {
  popupMirrorsList.innerHTML = '<span class="hint">Pinging live mirrors...</span>';

  let mirrors = DEFAULT_MIRRORS;
  try {
    const live = await fetchLiveMirrors();
    if (live && live.length > 0) mirrors = live;
  } catch (e) {}

  popupMirrorsList.innerHTML = '';

  for (const m of mirrors) {
    const row = document.createElement('div');
    row.className = 'popup-mirror-item';
    row.innerHTML = `
      <span>${m.replace(/^https?:\/\//, '')}</span>
      <span class="mirror-status">...</span>
    `;
    popupMirrorsList.appendChild(row);

    pingMirror(m, 2500).then((isAlive) => {
      const statusSpan = row.querySelector('.mirror-status');
      if (isAlive) {
        statusSpan.className = 'mirror-badge-online';
        statusSpan.textContent = 'Active ✅';
      } else {
        statusSpan.className = 'mirror-badge-offline';
        statusSpan.textContent = 'Offline ❌';
      }
    });
  }
}

btnSettings.addEventListener('click', openSettingsView);
btnBackFromSettings.addEventListener('click', () => closeSettingsView(true));
btnSaveInPopup.addEventListener('click', () => closeSettingsView(true));
btnPopupCheckMirrors.addEventListener('click', renderPopupMirrors);

// Initialize on popup opening
document.addEventListener('DOMContentLoaded', () => {
  loadPageMetadata();
});
