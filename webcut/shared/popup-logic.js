'use strict';

(function (root) {
  function countByType(pages) {
    var counts = { pages: 0, components: 0, total: 0 };
    if (!Array.isArray(pages)) return counts;
    pages.forEach(function (page) {
      if (!page || typeof page !== 'object' || Array.isArray(page)) return;
      if (page.type === 'page') counts.pages += 1;
      else if (page.type === 'component') counts.components += 1;
      else return;
      counts.total += 1;
    });
    return counts;
  }

  function normalizeHostUrl(input) {
    if (typeof input !== 'string') return null;
    var value = input.trim();
    if (!value) return '';

    var parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      return null;
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname) return null;

    var path = parsed.pathname || '/';
    if (path === '/') path = '';
    return parsed.origin + path + parsed.search + parsed.hash;
  }

  var reasonText = {
    restricted: 'WebCut cannot run on this kind of page (browser or store page).',
    'no-tab': 'No active tab was found. Click on a web page and try again.',
    'url-unknown': 'This tab is still loading. Wait for the page to finish and try again.',
    'inject-failed': 'WebCut could not start on this page.',
    'no-receiver': 'WebCut did not respond on this page after starting.'
  };

  function friendlyError(response) {
    if (!response || typeof response !== 'object') return 'Something went wrong';
    if (typeof response.error === 'string' && response.error.trim()) return response.error.trim();
    if (typeof response.reason === 'string' && reasonText[response.reason]) return reasonText[response.reason];
    return 'Something went wrong';
  }

  var API = {
    countByType: countByType,
    normalizeHostUrl: normalizeHostUrl,
    friendlyError: friendlyError
  };

  if (root) root.WebCutPopupLogic = API;
  if (typeof module !== 'undefined') module.exports = API;
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null)));
