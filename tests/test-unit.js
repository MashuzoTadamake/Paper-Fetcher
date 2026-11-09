/**
 * Unit verification tests for Paper Fetcher (Direct PDF Downloader)
 */

import { buildFilename } from '../lib/downloader.js';
import { normalizePdfUrl, isLikelyPdfUrl, DEFAULT_MIRRORS } from '../lib/scihub-resolver.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PaperExtractors = require('../content/extractors.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

console.log('\n--- Test 1: DOI Cleaning & Normalization ---');
const doiTests = [
  { input: '10.1016/j.cell.2023.01.001', expected: '10.1016/j.cell.2023.01.001' },
  { input: 'https://doi.org/10.1038/s41586-020-2649-2', expected: '10.1038/s41586-020-2649-2' },
  { input: '10.1016/j.ipm.2022.103061', expected: '10.1016/j.ipm.2022.103061' },
  { input: 'http://dx.doi.org/10.1109/CVPR.2016.90', expected: '10.1109/CVPR.2016.90' },
  { input: 'doi:10.1145/3372278.3390678.', expected: '10.1145/3372278.3390678' },
  { input: 'urn:doi:10.1002/advs.202100001)', expected: '10.1002/advs.202100001' },
  { input: '10.1002/(SICI)1097-0142(1996)77<2022>3.0.CO;2-P', expected: '10.1002/(SICI)1097-0142(1996)77<2022>3.0.CO;2-P' },
  { input: 'not-a-valid-doi', expected: null },
];

doiTests.forEach(({ input, expected }) => {
  const result = PaperExtractors.cleanDoi(input);
  assert(result === expected, `cleanDoi("${input}") === "${expected}"`);
});

console.log('\n--- Test 2: Clean Filename Construction ---');
const meta1 = {
  title: 'Federated learning review: Fundamentals, enabling technologies, and future applications',
  authors: ['C. Zhang', 'Y. Xie', 'H. Bai'],
  date: '2022-11-01',
  doi: '10.1016/j.ipm.2022.103061'
};
const filename1 = buildFilename(meta1);
console.log('  Generated filename:', filename1);
assert(!filename1.includes(':') && !filename1.includes('/'), 'Strips colon and slash from filename');
assert(filename1.endsWith('.pdf'), 'Ends with .pdf');
assert(filename1.includes('Zhang et al'), 'Includes author et al prefix');
assert(filename1.includes('(2022)'), 'Includes year tag');

console.log('\n--- Test 3: Sci-Hub PDF URL Detection & Guard ---');
const validPdfs = [
  'https://sci-hub.ru/storage/2024/9005/3230e7da3793f47f7ad75cd89382fa163dd097b67524fc9cc8390c5ddace8b19/banabilah2022.pdf',
  'https://sci.bban.top/pdf/10.1109/CVPR.2016.90.pdf',
  'https://zero.sci-hub.se/1234/test.pdf?download=true'
];
const invalidHtmlUrls = [
  'https://sci-hub.ee/10.1016/j.ipm.2022.103061',
  'https://sci-hub.ru/10.1109/CVPR.2016.90',
  'https://www.sciencedirect.com/science/article/abs/pii/S0306457322001649',
  'https://www.sciencedirect.com/science/article/abs/pii/S0167404824001469'
];

validPdfs.forEach(url => {
  assert(isLikelyPdfUrl(url), `Recognized genuine PDF: ${url.slice(0, 45)}...`);
});

invalidHtmlUrls.forEach(url => {
  assert(!isLikelyPdfUrl(url), `Correctly rejected HTML webpage: ${url.slice(0, 45)}...`);
});

console.log('\n--- Test 4: Missing Paper Identification ---');
const targetDoi = '10.1016/j.cose.2024.103845';
assert(PaperExtractors.cleanDoi(targetDoi) === targetDoi, `DOI ${targetDoi} correctly cleaned`);
const targetUrl = 'https://www.sciencedirect.com/science/article/abs/pii/S0167404824001469';
const piiMatch = targetUrl.match(/\/pii\/(S[0-9A-Za-z]+)/i);
assert(piiMatch && piiMatch[1] === 'S0167404824001469', 'ScienceDirect PII extraction: S0167404824001469');

const polymerDoi = '10.1016/j.pmatsci.2025.101544';
assert(PaperExtractors.cleanDoi(polymerDoi) === polymerDoi, `Polymer DOI ${polymerDoi} correctly cleaned`);
const polymerUrl = 'https://www.sciencedirect.com/science/article/pii/S0079642525001227';
const polymerPiiMatch = polymerUrl.match(/\/pii\/(S[0-9A-Za-z]+)/i);
assert(polymerPiiMatch && polymerPiiMatch[1] === 'S0079642525001227', 'ScienceDirect Polymer PII: S0079642525001227');

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
