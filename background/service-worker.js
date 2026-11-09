/**
 * Paper Fetcher - Background Service Worker
 * Handles badge management, Sci-Hub live mirror resolution & direct PDF downloads.
 */

import { downloadPdf } from '../lib/downloader.js';
import { getFastestWorkingMirror, findSciHubPdf, fetchLiveMirrors } from '../lib/scihub-resolver.js';

const DEFAULT_SETTINGS = {
  autoBadge: true
};

// Initialize settings and refresh mirror list on startup
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(current);

  // Discover latest live mirrors from sci-hub.pub
  try {
    const live = await fetchLiveMirrors();
    await chrome.storage.local.set({ customMirrors: live });
    console.log('[Paper Fetcher] Initialized with live mirrors:', live);
  } catch (e) {}
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  switch (request.action) {
    case 'PAPER_DETECTED': {
      if (tabId) {
        updateBadge(tabId, request.metadata);
      }
      sendResponse({ received: true });
      return false;
    }

    case 'OPEN_SCIHUB': {
      (async () => {
        try {
          const mirror = await getFastestWorkingMirror();
          const target = request.doi
            ? `${mirror}/${request.doi}`
            : `${mirror}/${encodeURIComponent(request.url)}`;

          const currentTab = sender.tab || (await getActiveTab());
          const index = currentTab ? currentTab.index + 1 : undefined;

          const newTab = await chrome.tabs.create({ url: target, index });
          sendResponse({ success: true, tabId: newTab.id, url: target, mirror });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'CHECK_SCIHUB_PDF': {
      (async () => {
        try {
          const result = await findSciHubPdf(request.doi);
          sendResponse(result);
        } catch (err) {
          sendResponse({ available: false, message: 'still not available on sci-hub :3' });
        }
      })();
      return true;
    }

    case 'DOWNLOAD_PDF': {
      (async () => {
        try {
          const meta = request.metadata;
          const targetDoi = meta.doi || meta.pii || meta.url;

          // 1. Probe Sci-Hub for direct PDF stream
          const scihubResult = await findSciHubPdf(targetDoi);

          if (scihubResult.available && scihubResult.pdfUrl) {
            // Direct stream found: download binary .pdf immediately into ~/Downloads
            const dlResult = await downloadPdf(scihubResult.pdfUrl, meta);
            sendResponse({
              success: true,
              filename: dlResult.filename,
              pdfUrl: scihubResult.pdfUrl,
              message: `Downloading: ${dlResult.filename}`
            });
            return;
          }

          // 2. If paper does NOT exist on Sci-Hub: STOP! Do not open tabs, do not download HTML!
          sendResponse({
            success: false,
            notAvailable: true,
            message: 'still not available on sci-hub :3'
          });
        } catch (err) {
          sendResponse({
            success: false,
            notAvailable: true,
            message: err.message || 'still not available on sci-hub :3'
          });
        }
      })();
      return true;
    }

    case 'TRIGGER_BROWSER_DOWNLOAD': {
      (async () => {
        try {
          if (request.pdfUrl) {
            await downloadPdf(request.pdfUrl, { title: request.title });
            sendResponse({ success: true });
          }
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }

    default:
      return false;
  }
});

async function updateBadge(tabId, metadata) {
  try {
    const settings = await chrome.storage.sync.get(['autoBadge']);
    if (settings.autoBadge === false) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }

    if (metadata && (metadata.doi || metadata.title)) {
      if (metadata.isPaywalled) {
        await chrome.action.setBadgeText({ tabId, text: 'LOCK' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#e11d48' });
      } else {
        await chrome.action.setBadgeText({ tabId, text: 'DOI' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b82f6' });
      }
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch (e) {}
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}
