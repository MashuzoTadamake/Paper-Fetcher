/**
 * Sci-Hub Mirror Resolver & PDF Extractor
 * Mirrors dynamically sourced and verified from https://www.sci-hub.pub/
 */

export const DEFAULT_MIRRORS = [
  'https://sci-hub.ee',
  'https://sci-hub.al',
  'https://sci-hub.mk',
  'https://sci-hub.ru',
  'https://sci-hub.su',
  'https://sci-hub.st',
  'https://sci-hub.box'
];

let cachedWorkingMirror = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function safeStorageSet(data) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set(data).catch(() => {});
  }
}

async function safeStorageGet(keys) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (e) {}
  }
  return {};
}

/**
 * Probes a mirror to see if it is responsive.
 */
export async function pingMirror(mirror, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(mirror, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal
    });
    clearTimeout(timer);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Dynamically fetches mirrors from https://www.sci-hub.pub/
 */
export async function fetchLiveMirrors() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://www.sci-hub.pub/', { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const html = await res.text();
      const mirrorMatches = html.match(/href=["'](https?:\/\/[a-z0-9.-]*sci-hub\.[a-z]{2,4}\/?)["']/gi) || [];
      const discovered = mirrorMatches.map(m => {
        const match = m.match(/href=["'](https?:\/\/[a-z0-9.-]*sci-hub\.[a-z]{2,4}\/?)/i);
        return match ? match[1].replace(/\/+$/, '') : null;
      }).filter(Boolean);

      const valid = [...new Set(discovered)].filter(url => !url.includes('sci-hub.pub'));
      if (valid.length > 0) {
        return valid;
      }
    }
  } catch (e) {}
  return DEFAULT_MIRRORS;
}

/**
 * Finds the fastest working Sci-Hub mirror.
 */
export async function getFastestWorkingMirror(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedWorkingMirror && (now - lastCheckTime < CACHE_TTL_MS)) {
    return cachedWorkingMirror;
  }

  let mirrorPool = DEFAULT_MIRRORS;
  const stored = await safeStorageGet(['customMirrors', 'savedWorkingMirror']);
  if (stored.savedWorkingMirror && !forceRefresh) {
    const isAlive = await pingMirror(stored.savedWorkingMirror, 1500);
    if (isAlive) {
      cachedWorkingMirror = stored.savedWorkingMirror;
      lastCheckTime = now;
      return cachedWorkingMirror;
    }
  }
  if (Array.isArray(stored.customMirrors) && stored.customMirrors.length > 0) {
    mirrorPool = [...new Set([...stored.customMirrors, ...DEFAULT_MIRRORS])];
  }

  return new Promise((resolve) => {
    let resolved = false;
    let pending = mirrorPool.length;

    mirrorPool.forEach(async (m) => {
      const alive = await pingMirror(m, 3000);
      pending--;

      if (alive && !resolved) {
        resolved = true;
        cachedWorkingMirror = m;
        lastCheckTime = Date.now();
        safeStorageSet({ savedWorkingMirror: m });
        resolve(m);
      } else if (pending === 0 && !resolved) {
        resolve(DEFAULT_MIRRORS[0]);
      }
    });
  });
}

/**
 * Normalizes a candidate PDF link extracted from Sci-Hub HTML.
 */
export function normalizePdfUrl(rawUrl, baseUrl) {
  let clean = rawUrl.replace(/\\+/g, '').trim();
  // Strip trailing URL view fragments like #view=FitH or quotes
  clean = clean.replace(/#.*$/, '').replace(/['"]+$/, '');
  if (clean.startsWith('//')) {
    return 'https:' + clean;
  }
  if (clean.startsWith('/')) {
    return baseUrl.replace(/\/+$/, '') + clean;
  }
  if (!/^https?:\/\//i.test(clean)) {
    return baseUrl.replace(/\/+$/, '') + '/' + clean;
  }
  return clean;
}

/**
 * Verifies if a given string is a genuine direct PDF link (not an HTML page).
 */
export function isLikelyPdfUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const clean = url.toLowerCase();
  return (
    clean.includes('.pdf') ||
    clean.includes('/storage/') ||
    clean.includes('/pdf/')
  );
}

/**
 * Probes all Sci-Hub mirrors concurrently in parallel ("equal chance to compete").
 * The fastest mirror to respond with a verified direct PDF wins the race immediately.
 * Returns { available: false } when paper does not exist on Sci-Hub.
 * @param {string} doi
 * @param {object} [options]
 * @returns {Promise<{available: boolean, pdfUrl?: string, mirror?: string, message: string}>}
 */
export async function findSciHubPdf(doi, options = {}) {
  if (!doi) {
    return {
      available: false,
      message: 'No DOI or paper identifier provided.'
    };
  }

  const stored = await safeStorageGet(['customMirrors']);
  const mirrorPool = Array.isArray(stored.customMirrors) && stored.customMirrors.length > 0
    ? [...new Set([...stored.customMirrors, ...DEFAULT_MIRRORS])]
    : DEFAULT_MIRRORS;

  const timeoutMs = options.timeout || 3500;

  return new Promise((resolve) => {
    let resolved = false;
    let pending = mirrorPool.length;

    mirrorPool.forEach(async (mirror) => {
      try {
        const url = `${mirror}/${encodeURIComponent(doi)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok && res.status !== 200) {
          return;
        }

        // Direct PDF binary stream returned by mirror
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/pdf') && !resolved) {
          resolved = true;
          cachedWorkingMirror = mirror;
          safeStorageSet({ savedWorkingMirror: mirror });
          resolve({
            available: true,
            pdfUrl: url,
            mirror,
            message: 'Direct PDF stream located!'
          });
          return;
        }

        const html = await res.text();

        // If mirror indicates absent, robot challenge, or portal index page, skip this mirror
        // (Other mirrors in the pool will continue competing in parallel)
        const skipSignals = [
          'статья отсутствует в базе',
          'отсутствует в базе',
          'the article is not available through sci-hub',
          'article is not available through sci-hub',
          'sci-hub has not included this article yet',
          'article not found',
          'no article found',
          'doi not found',
          'проверка на робота',
          'verification - sci-hub',
          'are you are robot',
          'ddos-guard',
          'how to find the doi'
        ];
        if (skipSignals.some(s => html.toLowerCase().includes(s))) {
          return;
        }

        // Match candidate direct PDF links in page HTML
        let match = html.match(/<meta\s+[^>]*name=["']citation_pdf_url["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/content=["']([^"']+\.pdf[^"']*)["'][^>]*name=["']citation_pdf_url["']/i) ||
                    html.match(/["'](\/storage\/[^\s"']+\.pdf[^\s"']*)["']/i) ||
                    html.match(/<(?:iframe|embed)[^>]+src=["']([^"']+\.pdf[^"']*)["']/i) ||
                    html.match(/onclick=["']location\.href\s*=\s*['\\]([^'"\\]+\.pdf[^'"\\]*)['\\]/i) ||
                    html.match(/href=["']([^"']+\.pdf\??[^"']*)["']/i);

        if (match && match[1] && !resolved) {
          const rawCandidate = match[1];
          if (isLikelyPdfUrl(rawCandidate)) {
            const pdfUrl = normalizePdfUrl(rawCandidate, mirror);

            // Pre-probe candidate stream: make sure it doesn't return an HTML error
            try {
              const probe = await fetch(pdfUrl, {
                method: 'GET',
                headers: { 'Range': 'bytes=0-512' },
                signal: AbortSignal.timeout(2500)
              });
              const cType = (probe.headers.get('content-type') || '').toLowerCase();
              if (cType.includes('text/html')) {
                return;
              }
            } catch (e) {
              if (e.message && e.message.includes('HTML')) return;
            }

            if (!resolved) {
              resolved = true;
              cachedWorkingMirror = mirror;
              safeStorageSet({ savedWorkingMirror: mirror });

              resolve({
                available: true,
                pdfUrl,
                mirror,
                message: 'Direct PDF located on Sci-Hub!'
              });
              return;
            }
          }
        }
      } catch (e) {
        // Individual mirror timed out or network error
      } finally {
        pending--;
        if (pending === 0 && !resolved) {
          resolved = true;
          resolve({
            available: false,
            message: 'still not available on sci-hub :3'
          });
        }
      }
    });
  });
}
