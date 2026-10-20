(function () {
  'use strict';

  var logic = typeof WebCutSidepanelLogic !== 'undefined' ? WebCutSidepanelLogic : null;
  var messageTypes = typeof WC !== 'undefined' && WC.MSG ? WC.MSG : {};
  var inDrawer = window.self !== window.top;
  if (inDrawer) document.body.classList.add('inside-drawer');

  var elements = {
    searchSection: document.querySelector('.search-section'),
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    savedCount: document.getElementById('saved-count'),
    status: document.getElementById('status'),
    emptyState: document.getElementById('empty-state'),
    recentSection: document.getElementById('recent-section'),
    recentList: document.getElementById('recent-list'),
    recentToggle: document.getElementById('recent-toggle'),
    foldersArea: document.getElementById('folders-area'),
    resultsSection: document.getElementById('results-section'),
    resultsHeading: document.getElementById('results-heading'),
    resultsList: document.getElementById('results-list'),
    previewView: document.getElementById('preview-view'),
    previewBack: document.getElementById('preview-back'),
    previewHeading: document.getElementById('preview-heading'),
    previewStatus: document.getElementById('preview-status'),
    previewFrameWrap: document.getElementById('preview-frame-wrap')
  };
  var state = {
    pages: [],
    query: '',
    recentExpanded: false,
    loading: false,
    view: 'list',
    previewId: null,
    previewLoading: false,
    previewError: '',
    previewHtml: ''
  };
  var screenshotState = Object.create(null);
  var busyIds = Object.create(null);
  var confirmingDelete = null;
  var screenshotObserver = null;
  var searchTimer = null;

  function setStatus(message, level) {
    elements.status.textContent = message;
    elements.status.dataset.level = level || 'info';
  }

  function responseError(response) {
    if (response && typeof response.error === 'string' && response.error.trim()) return response.error.trim();
    return 'Something went wrong';
  }

  function sendRuntimeMessage(message, callback) {
    try {
      chrome.runtime.sendMessage(message, function (response) {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          callback({ ok: false, error: lastError.message || 'The request failed.' });
          return;
        }
        callback(response && typeof response === 'object' ? response : { ok: false });
      });
    } catch (error) {
      callback({ ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  function pageById(id) {
    return state.pages.find(function (page) {
      return page && String(page.id) === String(id);
    }) || null;
  }

  function rememberScroll() {
    var scrolling = document.scrollingElement || document.documentElement || document.body;
    return scrolling ? scrolling.scrollTop : 0;
  }

  function restoreScroll(value) {
    var scrolling = document.scrollingElement || document.documentElement || document.body;
    if (!scrolling) return;
    window.requestAnimationFrame(function () {
      scrolling.scrollTop = value;
    });
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function makeButton(label, action, pageId, className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className || 'action-button';
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.pageId = String(pageId);
    return button;
  }

  function setBusy(id, busy) {
    if (busy) busyIds[id] = true;
    else delete busyIds[id];
  }

  function makeThumbnail(page) {
    var wrapper = document.createElement('div');
    wrapper.className = 'thumbnail';
    wrapper.dataset.screenshotId = String(page.id);
    var record = screenshotState[page.id];
    if (record && record.status === 'loaded' && record.value) {
      appendThumbnailImage(wrapper, record.value, page.id);
    } else {
      wrapper.classList.add('no-image');
    }
    return wrapper;
  }

  function appendThumbnailImage(wrapper, value, pageId) {
    clearNode(wrapper);
    wrapper.classList.remove('no-image');
    var image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = value;
    image.addEventListener('error', function () {
      screenshotState[pageId] = { status: 'failed' };
      wrapper.classList.add('no-image');
      clearNode(wrapper);
    }, { once: true });
    wrapper.appendChild(image);
  }

  function makeCard(page, compact) {
    var card = document.createElement('article');
    card.className = compact ? 'compact-card' : 'capture-card';
    card.dataset.pageId = String(page.id);

    var thumbnail = makeThumbnail(page);
    card.appendChild(thumbnail);

    var content = document.createElement('div');
    content.className = 'card-content';
    var title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = typeof page.title === 'string' && page.title.trim() ? page.title : 'Untitled capture';
    title.title = title.textContent;
    content.appendChild(title);
    var site = document.createElement('span');
    site.className = 'card-site';
    site.textContent = logic && typeof logic.siteName === 'function'
      ? (logic.siteName(page.url) || 'Unknown site')
      : 'Unknown site';
    content.appendChild(site);
    var meta = document.createElement('div');
    meta.className = 'card-meta';
    var badge = document.createElement('span');
    badge.className = 'type-badge';
    badge.textContent = page.type === 'component' ? 'component' : 'page';
    meta.appendChild(badge);
    var time = document.createElement('span');
    time.className = 'card-time';
    time.textContent = logic && typeof logic.relativeTime === 'function'
      ? logic.relativeTime(page.savedAt, Date.now())
      : 'Just now';
    meta.appendChild(time);
    content.appendChild(meta);
    card.appendChild(content);

    if (confirmingDelete === String(page.id)) {
      var confirm = document.createElement('div');
      confirm.className = 'confirm-row';
      var confirmText = document.createElement('p');
      confirmText.textContent = 'Delete this capture?';
      confirm.appendChild(confirmText);
      var confirmActions = document.createElement('div');
      confirmActions.className = 'confirm-actions';
      confirmActions.appendChild(makeButton('Cancel', 'cancel-delete', page.id));
      confirmActions.appendChild(makeButton('Delete', 'confirm-delete', page.id, 'action-button action-button-danger'));
      confirm.appendChild(confirmActions);
      card.appendChild(confirm);
    } else {
      var actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.appendChild(makeButton('Preview', 'preview', page.id));
      actions.appendChild(makeButton('Download', 'download', page.id));
      actions.appendChild(makeButton('Delete', 'delete', page.id, 'action-button action-button-danger'));
      card.appendChild(actions);
    }

    var buttons = card.querySelectorAll('button');
    buttons.forEach(function (button) {
      button.disabled = Boolean(busyIds[String(page.id)]);
    });
    return card;
  }

  function renderCompactList(container, pages) {
    clearNode(container);
    pages.forEach(function (page) {
      container.appendChild(makeCard(page, true));
    });
  }

  function renderGroupedList(container, pages) {
    clearNode(container);
    var groups = logic && typeof logic.groupByDate === 'function'
      ? logic.groupByDate(pages, Date.now())
      : [];
    groups.forEach(function (group) {
      var heading = document.createElement('h3');
      heading.className = 'group-heading';
      heading.textContent = group.label;
      container.appendChild(heading);
      var list = document.createElement('div');
      list.className = 'group-list';
      group.items.forEach(function (page) {
        list.appendChild(makeCard(page, false));
      });
      container.appendChild(list);
    });
  }

  function renderNoResults(container) {
    var empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No results';
    container.appendChild(empty);
  }

  function renderPreview() {
    var page = pageById(state.previewId);
    elements.previewHeading.textContent = page && typeof page.title === 'string' && page.title.trim()
      ? page.title
      : 'Preview';
    clearNode(elements.previewFrameWrap);
    if (state.previewLoading) {
      elements.previewStatus.textContent = 'Loading preview…';
      elements.previewStatus.dataset.level = 'info';
      return;
    }
    if (state.previewError) {
      elements.previewStatus.textContent = state.previewError;
      elements.previewStatus.dataset.level = 'error';
      return;
    }
    elements.previewStatus.textContent = 'Preview';
    elements.previewStatus.dataset.level = 'info';
    var frame = document.createElement('iframe');
    frame.className = 'preview-frame';
    frame.title = 'Saved capture preview';
    frame.setAttribute('sandbox', '');
    frame.srcdoc = state.previewHtml;
    elements.previewFrameWrap.appendChild(frame);
  }

  function renderList(scrollTop) {
    var query = state.query.trim();
    var allPages = logic && typeof logic.filterPages === 'function'
      ? logic.filterPages(state.pages, '')
      : [];
    var hasPages = allPages.length > 0;
    var queryActive = query.length > 0;
    var visiblePages = logic && typeof logic.filterPages === 'function'
      ? logic.filterPages(state.pages, query)
      : [];
    elements.savedCount.textContent = allPages.length + (allPages.length === 1 ? ' saved' : ' saved');
    elements.searchSection.hidden = false;
    elements.previewView.hidden = true;
    elements.emptyState.hidden = state.loading || hasPages || queryActive;
    elements.recentSection.hidden = state.loading || !hasPages || queryActive;
    elements.foldersArea.hidden = state.loading || !hasPages || queryActive;
    elements.resultsSection.hidden = state.loading || !queryActive;
    elements.resultsHeading.textContent = 'Search results (' + visiblePages.length + ')';
    elements.recentToggle.textContent = state.recentExpanded ? 'Show less' : 'Show all recent';
    elements.recentList.classList.toggle('expanded', state.recentExpanded);
    if (!state.loading && hasPages && !queryActive) {
      if (state.recentExpanded) renderGroupedList(elements.recentList, state.pages);
      else {
        var recent = logic && typeof logic.pickRecent === 'function' ? logic.pickRecent(state.pages, 2) : [];
        renderCompactList(elements.recentList, recent);
      }
    } else {
      clearNode(elements.recentList);
    }
    if (!state.loading && queryActive) {
      clearNode(elements.resultsList);
      if (visiblePages.length) visiblePages.forEach(function (page) {
        elements.resultsList.appendChild(makeCard(page, false));
      });
      else renderNoResults(elements.resultsList);
    } else {
      clearNode(elements.resultsList);
    }
    setupScreenshotObserver();
    if (scrollTop !== undefined) restoreScroll(scrollTop);
  }

  function renderApp(scrollTop) {
    if (state.view === 'preview') {
      elements.searchSection.hidden = true;
      elements.emptyState.hidden = true;
      elements.recentSection.hidden = true;
      elements.foldersArea.hidden = true;
      elements.previewView.hidden = false;
      elements.resultsSection.hidden = true;
      renderPreview();
      if (scrollTop !== undefined) restoreScroll(scrollTop);
      return;
    }
    renderList(scrollTop);
  }

  function loadPages(preserveScroll) {
    var scrollTop = preserveScroll ? rememberScroll() : undefined;
    state.loading = state.pages.length === 0;
    if (state.loading) {
      setStatus('Loading saved captures…', 'info');
      renderApp(scrollTop);
    } else {
      setStatus('Refreshing saved captures…', 'info');
    }
    sendRuntimeMessage({ type: messageTypes.getPages }, function (response) {
      if (!response || response.ok === false) {
        state.loading = false;
        setStatus(responseError(response), 'error');
        renderApp(scrollTop);
        return;
      }
      state.pages = Array.isArray(response.pages) ? response.pages.slice() : [];
      state.loading = false;
      setStatus('Ready.', 'info');
      renderApp(scrollTop);
    });
  }

  function loadScreenshot(pageId, wrapper) {
    var key = String(pageId);
    var record = screenshotState[key];
    if (record && (record.status === 'loading' || record.status === 'loaded' || record.status === 'failed')) return;
    screenshotState[key] = { status: 'loading' };
    sendRuntimeMessage({ type: messageTypes.getScreenshot, id: key }, function (response) {
      if (!response || response.ok === false) {
        screenshotState[key] = { status: 'failed' };
        if (wrapper && wrapper.isConnected) {
          wrapper.classList.add('no-image');
          clearNode(wrapper);
        }
        setStatus(responseError(response), 'error');
        return;
      }
      if (typeof response.value !== 'string' || response.value === '') {
        screenshotState[key] = { status: 'failed' };
        return;
      }
      screenshotState[key] = { status: 'loaded', value: response.value };
      if (wrapper && wrapper.isConnected) appendThumbnailImage(wrapper, response.value, key);
    });
  }

  function setupScreenshotObserver() {
    if (screenshotObserver) screenshotObserver.disconnect();
    var targets = document.querySelectorAll('.thumbnail[data-screenshot-id]');
    if (typeof IntersectionObserver !== 'function') {
      targets.forEach(function (target) {
        loadScreenshot(target.dataset.screenshotId, target);
      });
      return;
    }
    screenshotObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var target = entry.target;
        screenshotObserver.unobserve(target);
        loadScreenshot(target.dataset.screenshotId, target);
      });
    }, { rootMargin: '120px 0px' });
    targets.forEach(function (target) {
      if (!screenshotState[target.dataset.screenshotId]
        || screenshotState[target.dataset.screenshotId].status === 'loading') screenshotObserver.observe(target);
    });
  }

  function openPreview(pageId) {
    var page = pageById(pageId);
    if (!page || busyIds[String(pageId)]) return;
    var key = String(pageId);
    setBusy(key, true);
    var scrollTop = rememberScroll();
    state.view = 'preview';
    state.previewId = key;
    state.previewLoading = true;
    state.previewError = '';
    state.previewHtml = '';
    renderApp(scrollTop);
    sendRuntimeMessage({ type: messageTypes.getPageContent, id: key }, function (response) {
      setBusy(key, false);
      if (state.view !== 'preview' || state.previewId !== key) return;
      state.previewLoading = false;
      if (!response || response.ok === false) {
        state.previewError = responseError(response);
        renderApp(scrollTop);
        return;
      }
      if (typeof response.value !== 'string' || response.value === '') {
        state.previewError = 'Saved HTML is unavailable.';
        renderApp(scrollTop);
        return;
      }
      state.previewHtml = response.value;
      renderApp(scrollTop);
    });
  }

  function closePreview() {
    var scrollTop = rememberScroll();
    state.view = 'list';
    state.previewId = null;
    state.previewLoading = false;
    state.previewError = '';
    state.previewHtml = '';
    renderApp(scrollTop);
  }

  function downloadPage(page) {
    var key = String(page.id);
    if (busyIds[key]) return;
    setBusy(key, true);
    renderApp(rememberScroll());
    setStatus('Loading HTML…', 'info');
    sendRuntimeMessage({ type: messageTypes.getPageContent, id: key }, function (response) {
      if (!response || response.ok === false) {
        setBusy(key, false);
        renderApp(rememberScroll());
        setStatus(responseError(response), 'error');
        return;
      }
      if (typeof response.value !== 'string' || response.value === '') {
        setBusy(key, false);
        renderApp(rememberScroll());
        setStatus('Saved HTML is unavailable.', 'error');
        return;
      }
      var objectUrl = null;
      try {
        var blob = new Blob([response.value], { type: 'text/html;charset=utf-8' });
        objectUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = objectUrl;
        link.download = page.fileName || 'WebCut-page.html';
        link.click();
        setStatus('Downloaded ' + link.download, 'success');
      } catch (error) {
        setStatus('Download failed: ' + (error && error.message ? error.message : String(error)), 'error');
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setBusy(key, false);
        renderApp(rememberScroll());
      }
    });
  }

  function confirmDelete(pageId) {
    var key = String(pageId);
    var page = pageById(key);
    if (!page || busyIds[key]) return;
    setBusy(key, true);
    setStatus('Deleting capture…', 'info');
    renderApp(rememberScroll());
    sendRuntimeMessage({ type: messageTypes.deletePage, id: key }, function (response) {
      setBusy(key, false);
      if (!response || response.ok === false) {
        renderApp(rememberScroll());
        setStatus(responseError(response), 'error');
        return;
      }
      delete screenshotState[key];
      confirmingDelete = null;
      state.pages = state.pages.filter(function (item) {
        return String(item.id) !== key;
      });
      renderApp(rememberScroll());
      setStatus('Capture deleted.', 'success');
    });
  }

  function handleCardAction(event) {
    var button = event.target.closest ? event.target.closest('button[data-action]') : null;
    if (!button) return;
    var action = button.dataset.action;
    var pageId = button.dataset.pageId;
    var page = pageById(pageId);
    if (!page && action !== 'cancel-delete' && action !== 'confirm-delete') return;
    if (action === 'preview') openPreview(pageId);
    else if (action === 'download') downloadPage(page);
    else if (action === 'delete') {
      confirmingDelete = String(pageId);
      renderApp(rememberScroll());
    } else if (action === 'cancel-delete') {
      confirmingDelete = null;
      renderApp(rememberScroll());
    } else if (action === 'confirm-delete') {
      confirmDelete(pageId);
    }
  }

  function handleSearchInput() {
    elements.clearSearch.hidden = elements.searchInput.value.trim() === '';
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      searchTimer = null;
      state.query = elements.searchInput.value;
      renderApp(rememberScroll());
    }, 150);
  }

  function clearSearch() {
    elements.searchInput.value = '';
    state.query = '';
    elements.clearSearch.hidden = true;
    renderApp(rememberScroll());
    elements.searchInput.focus();
  }

  function toggleRecent() {
    state.recentExpanded = !state.recentExpanded;
    renderApp(rememberScroll());
  }

  function listenForStorageChanges() {
    if (!chrome.storage || !chrome.storage.onChanged || typeof chrome.storage.onChanged.addListener !== 'function') return;
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName && areaName !== 'local') return;
      if (!changes || !Object.prototype.hasOwnProperty.call(changes, WC.KEYS.pages)) return;
      loadPages(true);
    });
  }

  function listenForDrawerEscape() {
    if (!inDrawer) return;
    window.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      try {
        chrome.runtime.sendMessage({ type: messageTypes.toggleDrawer }, function () {
          if (chrome.runtime.lastError) setStatus('Unable to close the drawer.', 'error');
        });
      } catch (error) {
        setStatus('Unable to close the drawer.', 'error');
      }
    }, true);
  }

  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.clearSearch.addEventListener('click', clearSearch);
  elements.recentToggle.addEventListener('click', toggleRecent);
  elements.previewBack.addEventListener('click', closePreview);
  elements.recentList.addEventListener('click', handleCardAction);
  elements.resultsList.addEventListener('click', handleCardAction);

  listenForStorageChanges();
  listenForDrawerEscape();
  renderApp();
  loadPages(false);
}());
