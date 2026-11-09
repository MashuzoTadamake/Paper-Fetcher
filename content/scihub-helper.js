/**
 * Paper Fetcher - Sci-Hub In-Page Helper
 * Detects binary PDF streams and triggers direct file downloads.
 */

(function () {
  'use strict';

  let hasDownloaded = false;

  function extractPdfFromPage() {
    // 1. Meta citation_pdf_url (used by sci-hub.ru for Elsevier/ScienceDirect storage PDFs)
    const metaPdf = document.querySelector('meta[name="citation_pdf_url"], meta[property="citation_pdf_url"]');
    if (metaPdf && metaPdf.content && (metaPdf.content.includes('.pdf') || metaPdf.content.includes('/storage/'))) {
      return metaPdf.content;
    }

    // 2. Embed or iframe
    const embed = document.querySelector('embed[type*="pdf"], iframe#pdf, iframe[src*=".pdf"]');
    if (embed && embed.src) {
      return embed.src;
    }

    // 3. Download buttons (e.g. <button onclick="location.href='...pdf'"> or <a>)
    const buttons = document.querySelectorAll('button[onclick*=".pdf"], a[onclick*=".pdf"], a[href*=".pdf"]');
    for (const btn of buttons) {
      const onclick = btn.getAttribute('onclick') || '';
      const match = onclick.match(/location\.href\s*=\s*['"]([^'"]+\.pdf[^'"]*)['"]/i);
      if (match) {
        return match[1];
      }
      if (btn.href && btn.href.includes('.pdf')) {
        return btn.href;
      }
    }

    // 4. Scan page HTML for storage links
    const storageMatch = document.documentElement.innerHTML.match(/["'](\/storage\/[^\s"']+\.pdf[^\s"']*)["']/i);
    if (storageMatch) {
      return storageMatch[1];
    }

    return null;
  }

  function injectDownloadBanner(pdfUrl) {
    if (document.getElementById('paper-fetcher-floating-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'paper-fetcher-floating-banner';
    banner.style.cssText = `
      position: fixed;
      top: 14px;
      right: 20px;
      z-index: 9999999;
      background: #059669;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: fadeIn 0.3s ease;
    `;

    banner.innerHTML = `
      <span style="font-weight:600;">Paper Fetcher</span>
      <a href="${pdfUrl}" download target="_blank" style="
        background: #ffffff;
        color: #047857;
        padding: 5px 12px;
        border-radius: 6px;
        text-decoration: none;
        font-weight: bold;
        font-size: 12px;
        cursor: pointer;
        display: inline-block;
      ">⬇️ Download PDF to PC</a>
      <span style="cursor:pointer;opacity:0.8;font-size:16px;" onclick="this.parentElement.remove()">✕</span>
    `;

    document.body.appendChild(banner);
  }

  function handleAutoDownload() {
    const rawPdf = extractPdfFromPage();
    if (!rawPdf) return false;

    let cleanUrl = rawPdf.replace(/\\+/g, '').trim();
    if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
    else if (cleanUrl.startsWith('/')) cleanUrl = window.location.origin + cleanUrl;

    // Inject direct download helper banner on page
    injectDownloadBanner(cleanUrl);

    // If opened via the extension's download action, trigger automatic download
    const urlParams = new URLSearchParams(window.location.search);
    const shouldDownload = urlParams.get('liberator_download') === 'true';

    if (shouldDownload && !hasDownloaded) {
      hasDownloaded = true;
      chrome.runtime.sendMessage({
        action: 'TRIGGER_BROWSER_DOWNLOAD',
        pdfUrl: cleanUrl,
        title: document.title
      }).catch(() => {});
    }

    return true;
  }

  // Attempt extraction immediately and retry as async embeds/scripts finish rendering
  if (!handleAutoDownload()) {
    let retries = 0;
    const interval = setInterval(() => {
      retries++;
      if (handleAutoDownload() || retries > 15) {
        clearInterval(interval);
      }
    }, 600);
  }
})();
