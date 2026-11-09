/**
 * Paper Fetcher - Academic Paper Metadata Extractors
 * Extracts DOI, title, authors, journal, date, and abstract from web pages.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PaperExtractors = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Standard regex to find DOIs in text, URLs, or metadata (supports standard and older SICI characters)
  const DOI_REGEX = /\b(10\.\d{4,9}\/[-._;()/:<>+=A-Za-z0-9]+)/i;

  /**
   * Cleans a raw DOI string by stripping URL prefixes, protocols, and trailing punctuation.
   * @param {string} rawDoi
   * @returns {string|null}
   */
  function cleanDoi(rawDoi) {
    if (!rawDoi || typeof rawDoi !== 'string') return null;

    let doi = rawDoi.trim();

    // Remove URI prefixes
    doi = doi.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:|urn:doi:)/i, '').trim();

    // Match exact standard DOI pattern
    const match = doi.match(DOI_REGEX);
    if (!match) return null;

    let candidate = match[1];

    // Remove trailing punctuation that often attaches to URLs or text (periods, commas, parens)
    while (candidate.length > 0 && /[.,;:!?)'"\]}>]$/.test(candidate)) {
      // If closing paren/bracket has a matching opener earlier, don't remove it
      if (candidate.endsWith(')') && (candidate.match(/\(/g) || []).length >= (candidate.match(/\)/g) || []).length) {
        break;
      }
      candidate = candidate.slice(0, -1);
    }

    return candidate || null;
  }

  /**
   * Extracts content attribute of a meta tag by name or property.
   * @param {string} name
   * @param {Document} [doc=document]
   * @returns {string|null}
   */
  function getMetaContent(name, doc = document) {
    const selector = `meta[name="${name}" i], meta[property="${name}" i]`;
    const meta = doc.querySelector(selector);
    return meta ? (meta.getAttribute('content') || '').trim() : null;
  }

  /**
   * Extracts all matching contents of meta tags (e.g. multiple citation_author tags).
   * @param {string} name
   * @param {Document} [doc=document]
   * @returns {string[]}
   */
  function getAllMetaContents(name, doc = document) {
    const selector = `meta[name="${name}" i], meta[property="${name}" i]`;
    const metas = doc.querySelectorAll(selector);
    const results = [];
    metas.forEach(meta => {
      const content = (meta.getAttribute('content') || '').trim();
      if (content && !results.includes(content)) {
        results.push(content);
      }
    });
    return results;
  }

  /**
   * Highwire Press / Google Scholar format extraction (Used by 90%+ of academic journals)
   */
  function extractHighwire(doc = document) {
    const doi = cleanDoi(getMetaContent('citation_doi', doc));
    const title = getMetaContent('citation_title', doc);
    const authors = getAllMetaContents('citation_author', doc);
    const journal = getMetaContent('citation_journal_title', doc) ||
                    getMetaContent('citation_conference_title', doc);
    const date = getMetaContent('citation_publication_date', doc) ||
                 getMetaContent('citation_date', doc) ||
                 getMetaContent('citation_year', doc);
    const volume = getMetaContent('citation_volume', doc);
    const issue = getMetaContent('citation_issue', doc);
    const firstPage = getMetaContent('citation_firstpage', doc);
    const lastPage = getMetaContent('citation_lastpage', doc);
    const pdfUrl = getMetaContent('citation_pdf_url', doc);

    const pages = firstPage ? (lastPage ? `${firstPage}-${lastPage}` : firstPage) : null;

    if (!doi && !title) return null;

    return {
      source: 'highwire',
      doi,
      title,
      authors: authors.length > 0 ? authors : null,
      journal,
      date,
      volume,
      issue,
      pages,
      pdfUrl
    };
  }

  /**
   * Dublin Core format extraction
   */
  function extractDublinCore(doc = document) {
    let rawDoi = getMetaContent('DC.identifier', doc) ||
                 getMetaContent('dc.identifier', doc) ||
                 getMetaContent('DC.Identifier', doc);

    const doi = cleanDoi(rawDoi);
    const title = getMetaContent('DC.title', doc) ||
                  getMetaContent('dc.title', doc) ||
                  getMetaContent('DC.Title', doc);

    const authors = [
      ...getAllMetaContents('DC.creator', doc),
      ...getAllMetaContents('dc.creator', doc),
      ...getAllMetaContents('DC.contributor', doc)
    ];

    const journal = getMetaContent('DC.source', doc) ||
                    getMetaContent('dc.source', doc) ||
                    getMetaContent('DC.publisher', doc);

    const date = getMetaContent('DC.date', doc) ||
                 getMetaContent('dc.date', doc) ||
                 getMetaContent('DC.issued', doc);

    const abstract = getMetaContent('DC.description', doc) ||
                     getMetaContent('dc.description', doc);

    if (!doi && !title) return null;

    return {
      source: 'dublin_core',
      doi,
      title,
      authors: authors.length > 0 ? authors : null,
      journal,
      date,
      abstract
    };
  }

  /**
   * PRISM format extraction (Publishing Requirements for Industry Standard Metadata)
   */
  function extractPrism(doc = document) {
    const doi = cleanDoi(getMetaContent('prism.doi', doc));
    const title = getMetaContent('prism.title', doc);
    const journal = getMetaContent('prism.publicationName', doc);
    const date = getMetaContent('prism.publicationDate', doc) ||
                 getMetaContent('prism.coverDate', doc);
    const volume = getMetaContent('prism.volume', doc);
    const issue = getMetaContent('prism.number', doc);

    if (!doi && !title) return null;

    return {
      source: 'prism',
      doi,
      title,
      authors: null,
      journal,
      date,
      volume,
      issue
    };
  }

  /**
   * JSON-LD (Schema.org) extraction
   */
  function extractJsonLd(doc = document) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '{}');
        const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);

        for (const item of items) {
          const type = item['@type'];
          const isArticle = type === 'ScholarlyArticle' ||
                            type === 'MedicalScholarlyArticle' ||
                            type === 'Article' ||
                            type === 'TechArticle' ||
                            type === 'PublicationIssue';

          if (isArticle || item.doi || item.identifier) {
            let rawDoi = item.doi;
            if (!rawDoi && typeof item.identifier === 'string') rawDoi = item.identifier;
            if (!rawDoi && Array.isArray(item.identifier)) {
              const doiObj = item.identifier.find(id =>
                (typeof id === 'string' && id.includes('10.')) ||
                (id && id.propertyID && id.propertyID.toLowerCase() === 'doi')
              );
              rawDoi = typeof doiObj === 'string' ? doiObj : doiObj?.value;
            }

            const doi = cleanDoi(rawDoi);
            const title = item.headline || item.name;

            let authors = null;
            if (item.author) {
              const rawAuthors = Array.isArray(item.author) ? item.author : [item.author];
              authors = rawAuthors.map(a => (typeof a === 'string' ? a : a.name)).filter(Boolean);
            }

            const journal = item.isPartOf?.name || item.publisher?.name || null;
            const date = item.datePublished || item.dateCreated;
            const abstract = item.description || item.abstract;

            if (doi || title) {
              return {
                source: 'json_ld',
                doi,
                title,
                authors,
                journal,
                date,
                abstract
              };
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors in malformed script tags
      }
    }
    return null;
  }

  /**
   * URL and Document heuristics fallback
   */
  function extractFromPageContext(doc = document) {
    // 1. Check current URL for DOI
    let urlDoi = cleanDoi(doc.location?.href);

    // 2. Scan standard DOI links (e.g., https://doi.org/10.xxxx)
    if (!urlDoi) {
      const doiLinks = doc.querySelectorAll('a[href*="doi.org/10."], a[href*="/10."], a[data-doi]');
      for (const link of doiLinks) {
        const cleaned = cleanDoi(link.getAttribute('href') || link.getAttribute('data-doi') || link.textContent);
        if (cleaned) {
          urlDoi = cleaned;
          break;
        }
      }
    }

    // 3. Scan ScienceDirect or Elsevier specific PII in URL
    const piiMatch = (doc.location?.href || '').match(/\/pii\/(S[0-9A-Za-z]+)/i);
    let pii = piiMatch ? piiMatch[1] : null;

    // 4. Document title fallback
    let cleanTitle = doc.title || '';
    // Strip common publisher suffixes
    cleanTitle = cleanTitle
      .replace(/\s*[-–—|]\s*(ScienceDirect|SpringerLink|Nature|Wiley Online Library|IEEE Xplore|PubMed|PMC|Frontiers|MDPI|arXiv|SAGE Journals|ACM Digital Library|Oxford Academic|Taylor & Francis Online).*$/i, '')
      .trim();

    return {
      source: 'fallback',
      doi: urlDoi || pii,
      pii,
      title: cleanTitle || null,
      authors: null,
      journal: null,
      date: null
    };
  }

  /**
   * Heuristic paywall detection
   */
  function detectPaywall(doc = document) {
    const textContent = (doc.body ? doc.body.innerText.substring(0, 5000) : '').toLowerCase();
    const urlIsAbstract = Boolean(doc.location?.pathname && doc.location.pathname.includes('/article/abs/'));

    const paywallSignals = [
      'purchase pdf',
      'get access',
      'rent or buy article',
      'access through your institution',
      'access through your organization',
      'sign in to access',
      'log in to check access',
      'subscribe to read',
      'pay per view',
      'article purchase',
      'deepdyve'
    ];

    const detectedSignal = paywallSignals.find(signal => textContent.includes(signal));

    const paywallElements = doc.querySelector(
      '.paywall, #paywall, .article-access-options, .purchase-options, .access-banner, .login-to-view, .AccessIndicator'
    );

    const isPaywalled = Boolean(urlIsAbstract || detectedSignal || paywallElements);

    return {
      isPaywalled,
      indicator: urlIsAbstract ? 'sciencedirect-abs-url' : (detectedSignal || (paywallElements ? 'paywall-element' : null))
    };
  }

  /**
   * Main unified extraction pipeline. Aggregates data from all extractors,
   * preferring Highwire -> JSON-LD -> Dublin Core -> PRISM -> Fallbacks.
   * @param {Document} [doc=document]
   * @returns {object}
   */
  function extractPaperMetadata(doc = document) {
    const hw = extractHighwire(doc) || {};
    const jsonld = extractJsonLd(doc) || {};
    const dc = extractDublinCore(doc) || {};
    const prism = extractPrism(doc) || {};
    const fallback = extractFromPageContext(doc) || {};
    const paywall = detectPaywall(doc);

    // Merge priority: Highwire > JSON-LD > Dublin Core > PRISM > Fallback
    const doi = hw.doi || jsonld.doi || dc.doi || prism.doi || fallback.doi || null;
    const title = hw.title || jsonld.title || dc.title || prism.title || fallback.title || null;
    const authors = hw.authors || jsonld.authors || dc.authors || null;
    const journal = hw.journal || jsonld.journal || dc.journal || prism.journal || null;
    const date = hw.date || jsonld.date || dc.date || prism.date || null;
    const volume = hw.volume || prism.volume || null;
    const issue = hw.issue || prism.issue || null;
    const pages = hw.pages || null;
    const abstract = dc.abstract || jsonld.abstract || null;
    const pdfUrl = hw.pdfUrl || null;

    return {
      found: Boolean(doi || (title && authors)),
      doi,
      title: title ? title.trim() : null,
      authors: authors || [],
      journal: journal ? journal.trim() : null,
      date: date ? date.trim() : null,
      volume: volume ? volume.trim() : null,
      issue: issue ? issue.trim() : null,
      pages: pages ? pages.trim() : null,
      abstract: abstract ? abstract.trim() : null,
      pdfUrl: pdfUrl ? pdfUrl.trim() : null,
      url: doc.location?.href || '',
      isPaywalled: paywall.isPaywalled,
      paywallIndicator: paywall.indicator
    };
  }

  return {
    cleanDoi,
    extractHighwire,
    extractDublinCore,
    extractPrism,
    extractJsonLd,
    extractFromPageContext,
    detectPaywall,
    extractPaperMetadata
  };
});
