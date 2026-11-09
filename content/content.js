/**
 * Paper Fetcher - Content Script
 * Scans academic pages, detects paper metadata, communicates with background & popup.
 */

(function () {
  'use strict';

  // Prevent multiple initializations in frames
  if (window.__PAPER_FETCHER_INITIALIZED__) return;
  window.__PAPER_FETCHER_INITIALIZED__ = true;

  let cachedMetadata = null;
  let debounceTimer = null;

  /**
   * Scans document for paper metadata and notifies background worker.
   */
  function scanAndNotify() {
    try {
      if (!window.PaperExtractors) return;
      const metadata = window.PaperExtractors.extractPaperMetadata(document);
      cachedMetadata = metadata;

      if (metadata.found) {
        chrome.runtime.sendMessage({
          action: 'PAPER_DETECTED',
          metadata
        }).catch(() => {
          // Extension context may be reloading; safely ignore
        });
      }
    } catch (err) {
      console.debug('[Paper Fetcher] Extraction scan error:', err);
    }
  }

  // Initial scan on load
  scanAndNotify();

  // Listen for requests from popup or background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAPER_METADATA') {
      // Re-scan to ensure dynamic updates are caught
      if (window.PaperExtractors) {
        cachedMetadata = window.PaperExtractors.extractPaperMetadata(document);
      }
      sendResponse({ success: true, metadata: cachedMetadata });
      return true;
    }

    if (request.action === 'RESCAN_PAPER') {
      scanAndNotify();
      sendResponse({ success: true, metadata: cachedMetadata });
      return true;
    }
  });

  // Watch for dynamic Single Page App (SPA) page title / URL changes
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scanAndNotify, 600);
    }
  });

  observer.observe(document, { subtree: true, childList: true });
})();
