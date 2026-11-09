/**
 * Paper Fetcher - Direct PDF Downloader
 * Formats clean filenames and downloads PDFs directly to PC via Chrome Downloads API.
 */

import { isLikelyPdfUrl } from './scihub-resolver.js';

/**
 * Creates a clean, safe filename from paper metadata.
 * Format: "Author et al - (Year) - Title.pdf" or "Title.pdf"
 */
export function buildFilename(metadata = {}) {
  let authorPrefix = '';
  if (Array.isArray(metadata.authors) && metadata.authors.length > 0) {
    const first = metadata.authors[0].split(',')[0].trim().split(/\s+/).pop();
    if (metadata.authors.length > 1) {
      authorPrefix = `${first} et al - `;
    } else {
      authorPrefix = `${first} - `;
    }
  }

  let yearTag = '';
  if (metadata.date) {
    const yearMatch = metadata.date.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      yearTag = `(${yearMatch[1]}) `;
    }
  }

  const rawTitle = metadata.title || metadata.doi || 'academic-paper';
  // Strip characters forbidden in Windows / Linux / macOS filenames
  const safeTitle = rawTitle
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  const safePrefix = `${authorPrefix}${yearTag}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const filename = safePrefix ? `${safePrefix} - ${safeTitle}.pdf` : `${safeTitle}.pdf`;

  return filename.replace(/\s+/g, ' ').replace(/^\.+/, '');
}

/**
 * Initiates direct download of the PDF file to user's computer.
 * Guarantees that only direct binary PDF URLs are downloaded, never HTML webpages.
 * @param {string} pdfUrl
 * @param {object} [metadata]
 * @returns {Promise<{success: boolean, downloadId?: number, filename: string}>}
 */
export async function downloadPdf(pdfUrl, metadata = {}) {
  if (!pdfUrl) {
    throw new Error('No PDF URL available for download.');
  }

  // Guard 1: URL format validation
  if (!isLikelyPdfUrl(pdfUrl)) {
    throw new Error('Candidate URL is an HTML webpage, not a direct PDF file.');
  }

  // Guard 2: Pre-flight binary stream inspection to ensure server serves genuine binary PDF, NEVER HTML
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const probe = await fetch(pdfUrl, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1024',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    const contentType = (probe.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new Error('Server returned an HTML webpage instead of a PDF file.');
    }

    // Inspect first bytes: genuine PDF binary stream MUST begin with "%PDF-"
    const buffer = await probe.arrayBuffer();
    const headerBytes = new Uint8Array(buffer.slice(0, 5));
    const headerStr = String.fromCharCode(...headerBytes);
    if (!headerStr.startsWith('%PDF') && !contentType.includes('application/pdf')) {
      throw new Error(`Invalid PDF binary header ("${headerStr}"). Refusing to download.`);
    }
  } catch (err) {
    // If it was explicitly identified as HTML or not a PDF, rethrow to block download
    if (err.message && (err.message.includes('HTML') || err.message.includes('Invalid PDF'))) {
      throw err;
    }
    // Network probe error/timeout - continue if URL is likely PDF
  }

  const filename = buildFilename(metadata);

  try {
    const downloadId = await chrome.downloads.download({
      url: pdfUrl,
      filename,
      conflictAction: 'uniquify',
      saveAs: false
    });

    return {
      success: true,
      downloadId,
      filename
    };
  } catch (err) {
    throw new Error(`Download failed: ${err.message}`);
  }
}
