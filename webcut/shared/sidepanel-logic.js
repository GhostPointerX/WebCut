'use strict';

(function (root) {
  function validPage(page) {
    return Boolean(page && typeof page === 'object' && !Array.isArray(page)
      && typeof page.id === 'string' && page.id.trim() !== ''
      && (page.type === 'page' || page.type === 'component'));
  }

  function pageList(pages) {
    if (!Array.isArray(pages)) return [];
    return pages.filter(validPage);
  }

  function filterPages(pages, query) {
    var items = pageList(pages);
    var value = typeof query === 'string' ? query.trim().toLocaleLowerCase() : '';
    if (!value) return items;
    return items.filter(function (page) {
      var title = typeof page.title === 'string' ? page.title : '';
      var url = typeof page.url === 'string' ? page.url : '';
      return title.toLocaleLowerCase().indexOf(value) !== -1
        || url.toLocaleLowerCase().indexOf(value) !== -1;
    });
  }

  function savedAtValue(page) {
    return typeof page.savedAt === 'number' && Number.isFinite(page.savedAt) ? page.savedAt : -Infinity;
  }

  function newestFirst(pages) {
    return pageList(pages).map(function (page, index) {
      return { page: page, index: index };
    }).sort(function (left, right) {
      var difference = savedAtValue(right.page) - savedAtValue(left.page);
      return difference || left.index - right.index;
    }).map(function (entry) {
      return entry.page;
    });
  }

  function pickRecent(pages, n) {
    var limit = n === undefined ? 2 : n;
    if (!Number.isInteger(limit) || limit < 0) limit = 2;
    return newestFirst(pages).slice(0, limit);
  }

  function dateValue(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value.getTime());
    if (typeof value === 'number' && Number.isFinite(value)) {
      var date = new Date(value);
      if (Number.isFinite(date.getTime())) return date;
    }
    return null;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function groupByDate(pages, now) {
    var current = dateValue(now) || new Date();
    var currentDay = startOfDay(current);
    var groups = { Today: [], Yesterday: [], Earlier: [] };
    newestFirst(pages).forEach(function (page) {
      var saved = dateValue(page.savedAt);
      if (!saved) return;
      var dayDifference = Math.floor((currentDay - startOfDay(saved)) / 86400000);
      if (dayDifference <= 0) groups.Today.push(page);
      else if (dayDifference === 1) groups.Yesterday.push(page);
      else groups.Earlier.push(page);
    });
    return ['Today', 'Yesterday', 'Earlier'].filter(function (label) {
      return groups[label].length > 0;
    }).map(function (label) {
      return { label: label, items: groups[label] };
    });
  }

  function relativeTime(savedAt, now) {
    var saved = dateValue(savedAt);
    var current = dateValue(now) || new Date();
    if (!saved || saved.getTime() > current.getTime()) return 'Just now';
    var difference = current.getTime() - saved.getTime();
    if (difference < 60000) return 'Just now';
    if (difference < 3600000) return Math.max(1, Math.floor(difference / 60000)) + ' min ago';
    if (difference < 86400000) return Math.max(1, Math.floor(difference / 3600000)) + ' h ago';
    if (Math.floor((startOfDay(current) - startOfDay(saved)) / 86400000) === 1) return 'Yesterday';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return saved.getDate() + ' ' + months[saved.getMonth()];
  }

  function siteName(url) {
    if (typeof url !== 'string' || url.trim() === '') return '';
    try {
      var parsed = new URL(url);
      var hostname = parsed.hostname || '';
      return hostname.replace(/^www\./i, '');
    } catch (error) {
      return '';
    }
  }

  var API = {
    filterPages: filterPages,
    pickRecent: pickRecent,
    groupByDate: groupByDate,
    relativeTime: relativeTime,
    siteName: siteName
  };

  if (root) root.WebCutSidepanelLogic = API;
  if (typeof module !== 'undefined') module.exports = API;
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null)));
