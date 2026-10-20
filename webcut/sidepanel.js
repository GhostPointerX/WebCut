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
    newFolderButton: document.getElementById('new-folder-button'),
    newFolderForm: document.getElementById('new-folder-form'),
    newFolderInput: document.getElementById('new-folder-input'),
    createFolder: document.getElementById('create-folder'),
    cancelNewFolder: document.getElementById('cancel-new-folder'),
    newFolderError: document.getElementById('new-folder-error'),
    folderList: document.getElementById('folder-list'),
    resultsSection: document.getElementById('results-section'),
    resultsHeading: document.getElementById('results-heading'),
    resultsList: document.getElementById('results-list'),
    previewView: document.getElementById('preview-view'),
    previewBack: document.getElementById('preview-back'),
    previewHeading: document.getElementById('preview-heading'),
    previewStatus: document.getElementById('preview-status'),
    previewFrameWrap: document.getElementById('preview-frame-wrap'),
    folderView: document.getElementById('folder-view'),
    folderBack: document.getElementById('folder-back'),
    folderViewHeading: document.getElementById('folder-view-heading'),
    addToFolder: document.getElementById('add-to-folder'),
    folderPicker: document.getElementById('folder-picker'),
    folderPickerHeading: document.getElementById('folder-picker-heading'),
    folderPickerDone: document.getElementById('folder-picker-done'),
    folderPickerStatus: document.getElementById('folder-picker-status'),
    folderPickerList: document.getElementById('folder-picker-list'),
    folderStatus: document.getElementById('folder-status'),
    folderEmpty: document.getElementById('folder-empty'),
    folderItems: document.getElementById('folder-items')
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
    previewHtml: '',
    folders: [],
    folderId: null,
    folderPickerOpen: false,
    folderMenuId: null,
    folderFormOpen: false,
    folderFormError: '',
    renamingFolderId: null,
    renameFolderError: '',
    deletingFolderId: null,
    pageFolderChooserId: null,
    folderLoading: false
  };
  var screenshotState = Object.create(null);
  var busyIds = Object.create(null);
  var confirmingDelete = null;
  var screenshotObserver = null;
  var searchTimer = null;
  var requestBusy = 0;

  function setStatus(message, level) {
    elements.status.textContent = message;
    elements.status.dataset.level = level || 'info';
  }

  function responseError(response) {
    if (response && typeof response.error === 'string' && response.error.trim()) return response.error.trim();
    return 'Something went wrong';
  }

  function refreshButtonDisabled() {
    var globallyBusy = requestBusy > 0;
    document.querySelectorAll('button').forEach(function (button) {
      var busyKey = button.dataset.busyKey;
      button.disabled = Boolean(button.dataset.fixedDisabled === 'true')
        || globallyBusy
        || Boolean(busyKey && busyIds[busyKey]);
    });
  }

  function sendRuntimeMessage(message, callback) {
    requestBusy += 1;
    refreshButtonDisabled();
    try {
      chrome.runtime.sendMessage(message, function (response) {
        var lastError = chrome.runtime.lastError;
        requestBusy = Math.max(0, requestBusy - 1);
        refreshButtonDisabled();
        if (lastError) {
          callback({ ok: false, error: lastError.message || 'The request failed.' });
          return;
        }
        callback(response && typeof response === 'object' ? response : { ok: false });
      });
    } catch (error) {
      requestBusy = Math.max(0, requestBusy - 1);
      refreshButtonDisabled();
      callback({ ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  function pageById(id) {
    return state.pages.find(function (page) {
      return page && String(page.id) === String(id);
    }) || null;
  }

  function folderById(id) {
    return state.folders.find(function (folder) {
      return folder && String(folder.id) === String(id);
    }) || null;
  }

  function operationKey(prefix, first, second) {
    return prefix + ':' + String(first) + (second === undefined ? '' : ':' + String(second));
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

  function makeButton(label, action, pageId, className, busyKey) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className || 'action-button';
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.pageId = String(pageId);
    if (busyKey) button.dataset.busyKey = busyKey;
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

  function makeFolderIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 36 32');
    svg.setAttribute('class', 'folder-icon');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3 7.5A3.5 3.5 0 0 1 6.5 4h8l3 3H29.5A3.5 3.5 0 0 1 33 10.5v12A3.5 3.5 0 0 1 29.5 26h-23A3.5 3.5 0 0 1 3 22.5z');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('opacity', '0.24');
    svg.appendChild(path);
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', 'M4.5 10h27');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);
    return svg;
  }

  function makeFolderChooser(page) {
    var chooser = document.createElement('div');
    chooser.className = 'folder-chooser';
    var heading = document.createElement('span');
    heading.textContent = 'Add to folder';
    chooser.appendChild(heading);
    var addedIds = logic && typeof logic.foldersForPage === 'function'
      ? logic.foldersForPage(state.folders, String(page.id))
      : [];
    if (!state.folders.length) {
      var none = document.createElement('span');
      none.className = 'card-time';
      none.textContent = 'No folders available.';
      chooser.appendChild(none);
      return chooser;
    }
    var list = document.createElement('div');
    list.className = 'folder-chooser-list';
    state.folders.forEach(function (folder) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-button';
      button.dataset.action = 'add-page-to-folder';
      button.dataset.pageId = String(page.id);
      button.dataset.folderId = String(folder.id);
      button.dataset.busyKey = operationKey('add', folder.id, page.id);
      var added = addedIds.indexOf(String(folder.id)) !== -1;
      button.textContent = added ? folder.name + ' · Added' : folder.name;
      if (added) button.dataset.fixedDisabled = 'true';
      list.appendChild(button);
    });
    chooser.appendChild(list);
    return chooser;
  }

  function makeCard(page, compact, options) {
    var cardOptions = options || {};
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
      actions.appendChild(makeButton('Preview', 'preview', page.id, 'action-button', String(page.id)));
      actions.appendChild(makeButton('Download', 'download', page.id, 'action-button', String(page.id)));
      actions.appendChild(makeButton('Delete', 'delete', page.id, 'action-button action-button-danger', String(page.id)));
      if (cardOptions.folderId) {
        actions.appendChild(makeButton('Remove from folder', 'remove-from-folder', page.id, 'action-button action-button-danger', operationKey('remove', cardOptions.folderId, page.id)));
      } else {
        actions.appendChild(makeButton('Add to folder', 'open-folder-chooser', page.id, 'action-button', operationKey('chooser', page.id)));
      }
      card.appendChild(actions);
    }

    if (!cardOptions.folderId && state.pageFolderChooserId === String(page.id)) {
      card.appendChild(makeFolderChooser(page));
    }

    var buttons = card.querySelectorAll('button');
    buttons.forEach(function (button) {
      if (button.dataset.busyKey === undefined) button.dataset.busyKey = String(page.id);
      button.disabled = requestBusy > 0 || Boolean(button.dataset.fixedDisabled === 'true')
        || Boolean(busyIds[button.dataset.busyKey]);
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

  function setNewFolderError(message) {
    state.folderFormError = message || '';
    elements.newFolderError.textContent = state.folderFormError;
    elements.newFolderError.hidden = !state.folderFormError;
  }

  function setFolderStatus(message, level) {
    elements.folderStatus.textContent = message || '';
    elements.folderStatus.dataset.level = level || 'info';
  }

  function renderFolderTile(folder, counts) {
    var tile = document.createElement('article');
    tile.className = 'folder-tile' + (folder.isDefault ? ' folder-tile-default' : '');
    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'folder-tile-open';
    open.dataset.action = 'open-folder';
    open.dataset.folderId = String(folder.id);
    open.appendChild(makeFolderIcon());
    var name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = folder.name;
    name.title = folder.name;
    open.appendChild(name);
    var count = document.createElement('span');
    count.className = 'folder-count';
    count.textContent = String(counts[folder.id] || 0);
    open.appendChild(count);
    tile.appendChild(open);

    if (!folder.isDefault) {
      var menuButton = document.createElement('button');
      menuButton.type = 'button';
      menuButton.className = 'folder-menu-button';
      menuButton.dataset.action = 'folder-menu';
      menuButton.dataset.folderId = String(folder.id);
      menuButton.textContent = '⋯';
      menuButton.setAttribute('aria-label', 'Folder actions for ' + folder.name);
      tile.appendChild(menuButton);
      if (state.folderMenuId === String(folder.id)) {
        var menu = document.createElement('div');
        menu.className = 'folder-menu';
        var rename = document.createElement('button');
        rename.type = 'button';
        rename.textContent = 'Rename';
        rename.dataset.action = 'rename-folder';
        rename.dataset.folderId = String(folder.id);
        menu.appendChild(rename);
        var deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Delete';
        deleteButton.dataset.action = 'delete-folder';
        deleteButton.dataset.folderId = String(folder.id);
        menu.appendChild(deleteButton);
        tile.appendChild(menu);
      }
    }

    if (state.renamingFolderId === String(folder.id)) {
      var renameForm = document.createElement('form');
      renameForm.className = 'folder-inline-form';
      renameForm.dataset.folderId = String(folder.id);
      var renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.maxLength = 40;
      renameInput.value = folder.name;
      renameInput.setAttribute('aria-label', 'Rename ' + folder.name);
      renameInput.dataset.role = 'rename-input';
      renameForm.appendChild(renameInput);
      var renameActions = document.createElement('div');
      renameActions.className = 'folder-form-actions';
      var saveRename = document.createElement('button');
      saveRename.type = 'submit';
      saveRename.className = 'action-button action-button-primary';
      saveRename.textContent = 'Save';
      renameActions.appendChild(saveRename);
      var cancelRename = document.createElement('button');
      cancelRename.type = 'button';
      cancelRename.className = 'action-button';
      cancelRename.textContent = 'Cancel';
      cancelRename.dataset.action = 'cancel-rename-folder';
      cancelRename.dataset.folderId = String(folder.id);
      renameActions.appendChild(cancelRename);
      renameForm.appendChild(renameActions);
      var renameError = document.createElement('p');
      renameError.className = 'field-error';
      renameError.textContent = state.renameFolderError;
      renameError.hidden = !state.renameFolderError;
      renameForm.appendChild(renameError);
      tile.appendChild(renameForm);
      window.requestAnimationFrame(function () { renameInput.focus(); renameInput.select(); });
    } else if (state.deletingFolderId === String(folder.id)) {
      var deleteConfirm = document.createElement('div');
      deleteConfirm.className = 'folder-delete-confirm';
      var deleteText = document.createElement('p');
      deleteText.textContent = 'Delete folder ' + folder.name + '? The captures inside are kept.';
      deleteConfirm.appendChild(deleteText);
      var deleteActions = document.createElement('div');
      deleteActions.className = 'confirm-actions';
      var cancelDelete = document.createElement('button');
      cancelDelete.type = 'button';
      cancelDelete.className = 'action-button';
      cancelDelete.textContent = 'Cancel';
      cancelDelete.dataset.action = 'cancel-delete-folder';
      cancelDelete.dataset.folderId = String(folder.id);
      deleteActions.appendChild(cancelDelete);
      var confirmDeleteButton = document.createElement('button');
      confirmDeleteButton.type = 'button';
      confirmDeleteButton.className = 'action-button action-button-danger';
      confirmDeleteButton.textContent = 'Delete';
      confirmDeleteButton.dataset.action = 'confirm-delete-folder';
      confirmDeleteButton.dataset.folderId = String(folder.id);
      confirmDeleteButton.dataset.busyKey = operationKey('delete-folder', folder.id);
      deleteActions.appendChild(confirmDeleteButton);
      deleteConfirm.appendChild(deleteActions);
      tile.appendChild(deleteConfirm);
    }
    return tile;
  }

  function renderFolders() {
    clearNode(elements.folderList);
    if (state.folderLoading) {
      var loading = document.createElement('p');
      loading.className = 'card-time';
      loading.textContent = 'Loading folders…';
      elements.folderList.appendChild(loading);
      return;
    }
    var counts = logic && typeof logic.folderCounts === 'function'
      ? logic.folderCounts(state.folders, state.pages)
      : {};
    state.folders.forEach(function (folder) {
      elements.folderList.appendChild(renderFolderTile(folder, counts));
    });
  }

  function makePickerCard(page, folder) {
    var card = document.createElement('article');
    card.className = 'folder-picker-card';
    card.appendChild(makeThumbnail(page));
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
    card.appendChild(content);
    var folderIds = logic && typeof logic.foldersForPage === 'function'
      ? logic.foldersForPage(state.folders, String(page.id))
      : [];
    var key = operationKey('add', folder.id, page.id);
    if (folderIds.indexOf(String(folder.id)) !== -1) {
      var added = document.createElement('span');
      added.className = 'added-label';
      added.textContent = 'Added';
      card.appendChild(added);
    } else {
      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'action-button action-button-primary';
      add.textContent = 'Add';
      add.dataset.action = 'add-to-folder-picker';
      add.dataset.pageId = String(page.id);
      add.dataset.folderId = String(folder.id);
      add.dataset.busyKey = key;
      card.appendChild(add);
    }
    return card;
  }

  function renderFolderPicker(folder) {
    elements.folderPicker.hidden = !state.folderPickerOpen;
    clearNode(elements.folderPickerList);
    if (!state.folderPickerOpen) return;
    elements.folderPickerHeading.textContent = 'Add to ' + folder.name;
    var pages = logic && typeof logic.pickRecent === 'function'
      ? logic.pickRecent(state.pages, state.pages.length)
      : [];
    if (!pages.length) {
      var empty = document.createElement('p');
      empty.className = 'card-time';
      empty.textContent = 'No saved captures to add.';
      elements.folderPickerList.appendChild(empty);
      return;
    }
    pages.forEach(function (page) {
      elements.folderPickerList.appendChild(makePickerCard(page, folder));
    });
  }

  function renderFolderView(scrollTop) {
    var folder = folderById(state.folderId);
    if (!folder) {
      state.view = 'list';
      state.folderId = null;
      state.folderPickerOpen = false;
      elements.folderView.hidden = true;
      setStatus('That folder is no longer available.', 'error');
      renderList(scrollTop);
      return;
    }
    elements.folderViewHeading.textContent = folder.name;
    var items = logic && typeof logic.itemsInFolder === 'function'
      ? logic.itemsInFolder(folder, state.pages)
      : [];
    elements.folderEmpty.hidden = state.folderPickerOpen || items.length > 0;
    clearNode(elements.folderItems);
    items.forEach(function (page) {
      elements.folderItems.appendChild(makeCard(page, false, { folderId: String(folder.id) }));
    });
    renderFolderPicker(folder);
    setupScreenshotObserver();
    refreshButtonDisabled();
    if (scrollTop !== undefined) restoreScroll(scrollTop);
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
    elements.foldersArea.hidden = state.loading || queryActive;
    elements.resultsSection.hidden = state.loading || !queryActive;
    elements.resultsHeading.textContent = 'Search results (' + visiblePages.length + ')';
    elements.recentToggle.textContent = state.recentExpanded ? 'Show less' : 'Show all recent';
    elements.recentList.classList.toggle('expanded', state.recentExpanded);
    elements.newFolderForm.hidden = !state.folderFormOpen;
    elements.newFolderButton.hidden = state.folderFormOpen;
    elements.newFolderError.textContent = state.folderFormError;
    elements.newFolderError.hidden = !state.folderFormError;
    renderFolders();
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
    refreshButtonDisabled();
    if (scrollTop !== undefined) restoreScroll(scrollTop);
  }

  function renderApp(scrollTop) {
    if (state.view === 'folder') {
      elements.searchSection.hidden = true;
      elements.emptyState.hidden = true;
      elements.recentSection.hidden = true;
      elements.foldersArea.hidden = true;
      elements.resultsSection.hidden = true;
      elements.previewView.hidden = true;
      elements.folderView.hidden = false;
      renderFolderView(scrollTop);
      return;
    }
    if (state.view === 'preview') {
      elements.searchSection.hidden = true;
      elements.emptyState.hidden = true;
      elements.recentSection.hidden = true;
      elements.foldersArea.hidden = true;
      elements.previewView.hidden = false;
      elements.resultsSection.hidden = true;
      elements.folderView.hidden = true;
      renderPreview();
      if (scrollTop !== undefined) restoreScroll(scrollTop);
      return;
    }
    elements.folderView.hidden = true;
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

  function loadFolders(preserveScroll) {
    var scrollTop = preserveScroll ? rememberScroll() : undefined;
    state.folderLoading = state.folders.length === 0;
    if (state.folderLoading && state.view !== 'folder') renderApp(scrollTop);
    sendRuntimeMessage({ type: messageTypes.getFolders }, function (response) {
      if (!response || response.ok === false) {
        state.folderLoading = false;
        setStatus(responseError(response), 'error');
        renderApp(scrollTop);
        return;
      }
      state.folders = Array.isArray(response.folders) ? response.folders.slice() : [];
      state.folderLoading = false;
      if (state.view === 'folder' && !folderById(state.folderId)) {
        state.view = 'list';
        state.folderId = null;
        state.folderPickerOpen = false;
        setStatus('That folder is no longer available.', 'error');
      } else {
        setStatus('Ready.', 'info');
      }
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

  function openFolderView(folderId) {
    if (!folderById(folderId)) return;
    state.folderMenuId = null;
    state.pageFolderChooserId = null;
    state.view = 'folder';
    state.folderId = String(folderId);
    state.folderPickerOpen = false;
    setFolderStatus('', 'info');
    renderApp(rememberScroll());
  }

  function closeFolderView() {
    state.view = 'list';
    state.folderId = null;
    state.folderPickerOpen = false;
    state.pageFolderChooserId = null;
    renderApp(rememberScroll());
  }

  function openNewFolderForm() {
    state.folderFormOpen = true;
    setNewFolderError('');
    renderApp(rememberScroll());
    window.requestAnimationFrame(function () { elements.newFolderInput.focus(); });
  }

  function cancelNewFolder() {
    state.folderFormOpen = false;
    elements.newFolderInput.value = '';
    setNewFolderError('');
    renderApp(rememberScroll());
  }

  function createFolder() {
    if (requestBusy > 0) return;
    var validation = logic && typeof logic.validateFolderName === 'function'
      ? logic.validateFolderName(elements.newFolderInput.value, state.folders)
      : { ok: false, error: 'Folder name validation is unavailable.' };
    if (!validation.ok) {
      setNewFolderError(validation.error);
      return;
    }
    var key = 'create-folder';
    setBusy(key, true);
    refreshButtonDisabled();
    sendRuntimeMessage({ type: messageTypes.createFolder, name: validation.name }, function (response) {
      setBusy(key, false);
      if (!response || response.ok === false) {
        setNewFolderError(responseError(response));
        refreshButtonDisabled();
        return;
      }
      state.folderFormOpen = false;
      elements.newFolderInput.value = '';
      setNewFolderError('');
      setStatus('Folder created.', 'success');
      loadFolders(true);
    });
  }

  function startRenameFolder(folderId) {
    state.folderMenuId = null;
    state.renamingFolderId = String(folderId);
    state.renameFolderError = '';
    renderApp(rememberScroll());
  }

  function cancelRenameFolder() {
    state.renamingFolderId = null;
    state.renameFolderError = '';
    renderApp(rememberScroll());
  }

  function saveRenameFolder(folderId, value) {
    if (requestBusy > 0) return;
    var validation = logic && typeof logic.validateFolderName === 'function'
      ? logic.validateFolderName(value, state.folders, String(folderId))
      : { ok: false, error: 'Folder name validation is unavailable.' };
    if (!validation.ok) {
      state.renameFolderError = validation.error;
      renderApp(rememberScroll());
      return;
    }
    var key = operationKey('rename-folder', folderId);
    setBusy(key, true);
    refreshButtonDisabled();
    sendRuntimeMessage({ type: messageTypes.renameFolder, id: String(folderId), name: validation.name }, function (response) {
      setBusy(key, false);
      if (!response || response.ok === false) {
        state.renameFolderError = responseError(response);
        renderApp(rememberScroll());
        return;
      }
      state.renamingFolderId = null;
      state.renameFolderError = '';
      setStatus('Folder renamed.', 'success');
      loadFolders(true);
    });
  }

  function startDeleteFolder(folderId) {
    state.folderMenuId = null;
    state.deletingFolderId = String(folderId);
    renderApp(rememberScroll());
  }

  function cancelDeleteFolder() {
    state.deletingFolderId = null;
    renderApp(rememberScroll());
  }

  function confirmDeleteFolder(folderId) {
    if (requestBusy > 0) return;
    var key = operationKey('delete-folder', folderId);
    setBusy(key, true);
    refreshButtonDisabled();
    sendRuntimeMessage({ type: messageTypes.deleteFolder, id: String(folderId) }, function (response) {
      setBusy(key, false);
      if (!response || response.ok === false) {
        setStatus(responseError(response), 'error');
        renderApp(rememberScroll());
        return;
      }
      state.deletingFolderId = null;
      setStatus('Folder deleted. Captures were kept.', 'success');
      loadFolders(true);
    });
  }

  function toggleFolderPicker() {
    state.folderPickerOpen = !state.folderPickerOpen;
    renderApp(rememberScroll());
  }

  function addPageToFolder(folderId, pageId, keepPickerOpen) {
    if (requestBusy > 0) return;
    var folder = folderById(folderId);
    var page = pageById(pageId);
    if (!folder || !page) return;
    var key = operationKey('add', folderId, pageId);
    if (busyIds[key]) return;
    setBusy(key, true);
    refreshButtonDisabled();
    sendRuntimeMessage({ type: messageTypes.addToFolder, folderId: String(folderId), pageId: String(pageId) }, function (response) {
      setBusy(key, false);
      if (!response || response.ok === false) {
        if (keepPickerOpen) {
          elements.folderPickerStatus.textContent = responseError(response);
          elements.folderPickerStatus.dataset.level = 'error';
        } else setStatus(responseError(response), 'error');
        refreshButtonDisabled();
        return;
      }
      if (!keepPickerOpen) state.pageFolderChooserId = null;
      if (keepPickerOpen) {
        elements.folderPickerStatus.textContent = 'Added.';
        elements.folderPickerStatus.dataset.level = 'success';
      } else setStatus('Capture added to ' + folder.name + '.', 'success');
      loadFolders(true);
    });
  }

  function removePageFromFolder(folderId, pageId) {
    if (requestBusy > 0) return;
    var folder = folderById(folderId);
    var page = pageById(pageId);
    if (!folder || !page) return;
    var key = operationKey('remove', folderId, pageId);
    if (busyIds[key]) return;
    setBusy(key, true);
    refreshButtonDisabled();
    sendRuntimeMessage({ type: messageTypes.removeFromFolder, folderId: String(folderId), pageId: String(pageId) }, function (response) {
      setBusy(key, false);
      if (!response || response.ok === false) {
        setFolderStatus(responseError(response), 'error');
        refreshButtonDisabled();
        return;
      }
      setFolderStatus('Capture removed from ' + folder.name + '.', 'success');
      loadFolders(true);
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
    } else if (action === 'open-folder-chooser') {
      state.pageFolderChooserId = String(pageId);
      renderApp(rememberScroll());
    } else if (action === 'add-page-to-folder') {
      addPageToFolder(button.dataset.folderId, pageId, false);
    } else if (action === 'remove-from-folder') {
      removePageFromFolder(state.folderId, pageId);
    } else if (action === 'add-to-folder-picker') {
      addPageToFolder(button.dataset.folderId, pageId, true);
    } else if (action === 'cancel-delete') {
      confirmingDelete = null;
      renderApp(rememberScroll());
    } else if (action === 'confirm-delete') {
      confirmDelete(pageId);
    }
  }

  function handleFolderAction(event) {
    var button = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!button) return;
    var action = button.dataset.action;
    var folderId = button.dataset.folderId;
    if (action === 'open-folder') openFolderView(folderId);
    else if (action === 'folder-menu') {
      state.folderMenuId = state.folderMenuId === String(folderId) ? null : String(folderId);
      renderApp(rememberScroll());
    } else if (action === 'rename-folder') startRenameFolder(folderId);
    else if (action === 'delete-folder') startDeleteFolder(folderId);
    else if (action === 'cancel-delete-folder') cancelDeleteFolder();
    else if (action === 'confirm-delete-folder') confirmDeleteFolder(folderId);
    else if (action === 'cancel-rename-folder') cancelRenameFolder();
  }

  function handleRenameSubmit(event) {
    var form = event.target.closest ? event.target.closest('.folder-inline-form') : null;
    if (!form) return;
    event.preventDefault();
    var input = form.querySelector('[data-role="rename-input"]');
    saveRenameFolder(form.dataset.folderId, input ? input.value : '');
  }

  function handleNewFolderSubmit(event) {
    event.preventDefault();
    createFolder();
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
      if (!changes) return;
      if (Object.prototype.hasOwnProperty.call(changes, WC.KEYS.pages)) loadPages(true);
      if (Object.prototype.hasOwnProperty.call(changes, WC.KEYS.folders)) loadFolders(true);
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
  elements.newFolderButton.addEventListener('click', openNewFolderForm);
  elements.cancelNewFolder.addEventListener('click', cancelNewFolder);
  elements.newFolderForm.addEventListener('submit', handleNewFolderSubmit);
  elements.newFolderInput.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelNewFolder();
    }
  });
  elements.folderList.addEventListener('click', handleFolderAction);
  elements.folderList.addEventListener('submit', handleRenameSubmit);
  elements.folderBack.addEventListener('click', closeFolderView);
  elements.addToFolder.addEventListener('click', toggleFolderPicker);
  elements.folderPickerDone.addEventListener('click', toggleFolderPicker);
  elements.recentList.addEventListener('click', handleCardAction);
  elements.resultsList.addEventListener('click', handleCardAction);
  elements.folderItems.addEventListener('click', handleCardAction);
  elements.folderPickerList.addEventListener('click', handleCardAction);

  listenForStorageChanges();
  listenForDrawerEscape();
  renderApp();
  loadPages(false);
  loadFolders(false);
}());
