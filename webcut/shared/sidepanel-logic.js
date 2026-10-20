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

  function folderCounts(folders, pages) {
    var pageIds = Object.create(null);
    pageList(pages).forEach(function (page) {
      pageIds[page.id] = true;
    });
    var counts = {};
    if (!Array.isArray(folders)) return counts;
    folders.forEach(function (folder) {
      if (!folder || typeof folder !== 'object' || Array.isArray(folder)
        || typeof folder.id !== 'string' || !Array.isArray(folder.itemIds)) return;
      var seen = Object.create(null);
      counts[folder.id] = folder.itemIds.filter(function (pageId) {
        if (typeof pageId !== 'string' || !pageIds[pageId] || seen[pageId]) return false;
        seen[pageId] = true;
        return true;
      }).length;
    });
    return counts;
  }

  function itemsInFolder(folder, pages) {
    if (!folder || typeof folder !== 'object' || !Array.isArray(folder.itemIds)) return [];
    var ids = Object.create(null);
    folder.itemIds.forEach(function (pageId) {
      if (typeof pageId === 'string') ids[pageId] = true;
    });
    return pageList(pages).filter(function (page) {
      return ids[page.id];
    });
  }

  function foldersForPage(folders, pageId) {
    if (!Array.isArray(folders) || typeof pageId !== 'string') return [];
    return folders.filter(function (folder) {
      return folder && typeof folder === 'object' && Array.isArray(folder.itemIds)
        && folder.itemIds.indexOf(pageId) !== -1;
    }).map(function (folder) {
      return folder.id;
    }).filter(function (folderId) {
      return typeof folderId === 'string' && folderId !== '';
    });
  }

  function validateFolderName(name, folders, ignoreId) {
    if (typeof name !== 'string') return { ok: false, error: 'Folder name is required.' };
    var trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      return { ok: false, error: 'Folder name must be 1-40 characters.' };
    }
    var normalized = trimmed.toLocaleLowerCase();
    if (Array.isArray(folders) && folders.some(function (folder) {
      return folder && typeof folder === 'object'
        && (ignoreId === undefined || String(folder.id) !== String(ignoreId))
        && typeof folder.name === 'string'
        && folder.name.trim().toLocaleLowerCase() === normalized;
    })) {
      return { ok: false, error: 'A folder with that name already exists.' };
    }
    return { ok: true, name: trimmed };
  }

  var API = {
    filterPages: filterPages,
    pickRecent: pickRecent,
    groupByDate: groupByDate,
    relativeTime: relativeTime,
    siteName: siteName,
    folderCounts: folderCounts,
    itemsInFolder: itemsInFolder,
    foldersForPage: foldersForPage,
    validateFolderName: validateFolderName
  };

  if (root) root.WebCutSidepanelLogic = API;
  if (typeof module !== 'undefined') module.exports = API;
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null)));
