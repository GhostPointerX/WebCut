(function () {
  'use strict';

  if (window.__webcutContentLoaded) return;
  window.__webcutContentLoaded = true;

  var host = document.querySelector('webcut-ui-root');
  if (!host) {
    host = document.createElement('webcut-ui-root');
    document.documentElement.appendChild(host);
  }
  var shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  if (shadow.querySelector('.toolbar')) {
    return;
  }
  host.hidden = true;

  var stateApi = typeof WebCutToolbarState !== 'undefined' ? WebCutToolbarState : null;
  var toolbarState = stateApi ? stateApi.createToolbarState() : createFallbackState();
  var messageTypes = typeof WC !== 'undefined' && WC.MSG ? WC.MSG : {};
  var storageKeys = typeof WC !== 'undefined' && WC.KEYS ? WC.KEYS : {};
  var extensionDisabledKey = storageKeys.extensionDisabled || 'local:extension-disabled';
  var extensionDisabled = true;
  var manuallyActivated = false;
  var cloneLogic = typeof WebCutCloneLogic !== 'undefined'
    ? WebCutCloneLogic
    : (typeof window !== 'undefined' ? window.WebCutCloneLogic : null);
  var toolbar;
  var status;
  var statusDefault = 'Ready.';
  var lastCapture = { id: null, fileName: '', title: '', url: '', type: '', html: '', bytes: 0 };
  var previewModal = null;
  var previewRestoreFocus = null;
  var drawer = null;
  var drawerFrame = null;
  var drawerCloseButton = null;
  var drawerOpen = false;
  var selectionLogic = typeof WebCutSelectionLogic !== 'undefined'
    ? WebCutSelectionLogic
    : (typeof window !== 'undefined' ? window.WebCutSelectionLogic : null);
  var selection = {
    active: false,
    target: null,
    pointer: null,
    frame: null,
    nav: null,
    highlight: null,
    badge: null,
    listeners: []
  };
  var toolbarDrag = {
    active: false,
    offsetX: 0,
    offsetY: 0
  };

  var stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('content.css');
  stylesheet.addEventListener('load', function () {
    showToolbarWhenEnabled(showToolbar);
  }, { once: true });
  stylesheet.addEventListener('error', showFallback, { once: true });
  shadow.appendChild(stylesheet);

  toolbar = document.createElement('section');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'WebCut toolbar');
  toolbar.setAttribute('aria-describedby', 'webcut-status');

  var header = document.createElement('div');
  header.className = 'toolbar-header';
  var brand = document.createElement('div');
  brand.className = 'toolbar-brand';
  var logo = document.createElement('img');
  logo.className = 'toolbar-logo';
  logo.src = chrome.runtime.getURL('icons/icon-48.png');
  logo.alt = 'WebCut logo';
  var title = document.createElement('h1');
  title.textContent = 'WebCut';
  brand.appendChild(logo);
  brand.appendChild(title);
  header.appendChild(brand);
  var closeButton = createButton('close', '×', 'Close WebCut toolbar');
  header.appendChild(closeButton);

  var actions = document.createElement('div');
  actions.className = 'toolbar-actions';
  var fullPageButton = createButton('full-page', 'Clone Full Page', 'Clone full page');
  var componentButton = createButton('component', 'Clone Component', 'Clone selected component');
  var cancelButton = createButton('cancel', 'Cancel', 'Cancel current action');
  var savedButton = createButton('saved', 'Open Saved', 'Open saved captures');
  actions.appendChild(fullPageButton);
  actions.appendChild(componentButton);
  actions.appendChild(cancelButton);
  actions.appendChild(savedButton);

  status = document.createElement('p');
  status.id = 'webcut-status';
  status.className = 'toolbar-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = statusDefault;
  toolbar.appendChild(header);
  toolbar.appendChild(actions);
  toolbar.appendChild(status);
  shadow.appendChild(toolbar);
  createDrawer();

  closeButton.addEventListener('click', function () {
    cancelSelection();
    closeDrawer();
    manuallyActivated = false;
    setExtensionDisabled(true);
    host.hidden = true;
    setStatus('', 'info');
  });
  componentButton.addEventListener('click', function () {
    if (toolbarState.startSelecting()) {
      beginSelection();
      setStatus('Select mode: hover an element, use the up/down arrows to change it, click or press Enter to confirm, Escape to cancel.', 'info');
    }
    updateButtons();
  });
  fullPageButton.addEventListener('click', function () {
    startExport('page', null);
  });
  cancelButton.addEventListener('click', function () {
    cancelSelection();
    updateButtons();
  });
  savedButton.addEventListener('click', function () {
    showDrawer();
  });
  header.addEventListener('mousedown', startToolbarDrag);

  toolbarState.subscribe(function () {
    updateButtons();
  });
  updateButtons();

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return undefined;
    if (message.type === messageTypes.toggleToolbar) {
      activateExtension();
      host.hidden = false;
      if (toolbarState.get() !== 'idle') {
        sendResponse({ ok: true, visible: true, busy: true });
        return false;
      }
      if (message.action === 'page') {
        startExport('page', null);
      } else if (message.action === 'component' && toolbarState.startSelecting()) {
        beginSelection();
        setStatus('Select mode: hover an element, use the up/down arrows to change it, click or press Enter to confirm, Escape to cancel.', 'info');
        updateButtons();
      }
      sendResponse({ ok: true, visible: true });
      return false;
    }
    if (message.type === messageTypes.toggleDrawer) {
      if (extensionDisabled) {
        sendResponse({ ok: true, visible: false });
        return false;
      }
      sendResponse({ ok: true, visible: toggleDrawer() });
      return false;
    }
    return undefined;
  });

  window.addEventListener('pagehide', function () {
    endToolbarDrag();
    cancelSelection();
    closeDrawer();
  }, true);

  if (chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local' || !changes[extensionDisabledKey]) return;
      extensionDisabled = changes[extensionDisabledKey].newValue === true;
      if (extensionDisabled) {
        manuallyActivated = false;
        endToolbarDrag();
        cancelSelection();
        closeDrawer();
        host.hidden = true;
      } else if (manuallyActivated) {
        host.hidden = false;
      }
    });
  }

  function startToolbarDrag(event) {
    if (event.button !== 0) return;
    var target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('button')) return;
    var rect = toolbar.getBoundingClientRect();
    toolbarDrag.active = true;
    toolbarDrag.offsetX = event.clientX - rect.left;
    toolbarDrag.offsetY = event.clientY - rect.top;
    toolbar.style.left = rect.left + 'px';
    toolbar.style.top = rect.top + 'px';
    toolbar.style.transform = 'none';
    toolbar.classList.add('is-dragging');
    event.preventDefault();
    window.addEventListener('mousemove', moveToolbar, true);
    window.addEventListener('mouseup', endToolbarDrag, true);
  }

  function moveToolbar(event) {
    if (!toolbarDrag.active) return;
    var rect = toolbar.getBoundingClientRect();
    var maxLeft = Math.max(0, window.innerWidth - rect.width);
    var maxTop = Math.max(0, window.innerHeight - rect.height);
    var left = clamp(event.clientX - toolbarDrag.offsetX, 0, maxLeft);
    var top = clamp(event.clientY - toolbarDrag.offsetY, 0, maxTop);
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
    event.preventDefault();
  }

  function endToolbarDrag() {
    if (!toolbarDrag.active) return;
    toolbarDrag.active = false;
    toolbar.classList.remove('is-dragging');
    window.removeEventListener('mousemove', moveToolbar, true);
    window.removeEventListener('mouseup', endToolbarDrag, true);
  }

  function createButton(action, label, ariaLabel) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-button';
    button.dataset.action = action;
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    return button;
  }

  function updateButtons() {
    var current = toolbarState.get();
    fullPageButton.disabled = current !== 'idle';
    componentButton.disabled = current !== 'idle';
    cancelButton.disabled = current !== 'selecting';
    savedButton.disabled = current !== 'idle';
  }

  function beginSelection() {
    if (selection.active) return;
    selection.active = true;
    selection.target = null;
    selection.pointer = null;
    selection.nav = selectionLogic && typeof selectionLogic.createSelectionNav === 'function'
      ? selectionLogic.createSelectionNav()
      : null;
    selection.highlight = document.createElement('div');
    selection.highlight.className = 'selection-overlay selection-highlight';
    selection.highlight.setAttribute('aria-hidden', 'true');
    selection.badge = document.createElement('div');
    selection.badge.className = 'selection-overlay selection-badge selection-label';
    selection.badge.setAttribute('aria-hidden', 'true');
    selection.badge.hidden = true;
    if (toolbar.classList.contains('fallback')) {
      selection.highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #8bd5ca;border-radius:4px;background:rgb(139 213 202 / 9%);box-sizing:border-box;overflow:visible;';
      selection.badge.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;max-width:calc(100vw - 16px);padding:4px 7px;color:#171a24;font:600 11px/1.3 system-ui,sans-serif;white-space:normal;overflow-wrap:anywhere;overflow:visible;background:#b8f1e7;border:1px solid #8bd5ca;border-radius:5px;box-sizing:border-box;';
    }
    shadow.appendChild(selection.highlight);
    shadow.appendChild(selection.badge);
    selection.highlight.hidden = true;

    addSelectionListener('mousemove', onSelectionMouseMove, true);
    addSelectionListener('pointermove', onSelectionMouseMove, true);
    addSelectionListener('click', onSelectionClick, true);
    addSelectionListener('mousedown', blockSelectionEvent, true);
    addSelectionListener('mouseup', blockSelectionEvent, true);
    addSelectionListener('pointerdown', blockSelectionEvent, true);
    addSelectionListener('pointerup', blockSelectionEvent, true);
    addSelectionListener('auxclick', blockSelectionEvent, true);
    addSelectionListener('dblclick', blockSelectionEvent, true);
    addSelectionListener('contextmenu', blockSelectionEvent, true);
    addSelectionListener('submit', blockSelectionEvent, true);
    addSelectionListener('keydown', onSelectionKeyDown, true);
    addSelectionListener('scroll', repositionSelection, true);
    addSelectionListener('resize', repositionSelection, true);
  }

  function addSelectionListener(type, listener, capture) {
    window.addEventListener(type, listener, capture);
    selection.listeners.push({ type: type, listener: listener, capture: capture });
  }

  function removeSelectionListeners() {
    selection.listeners.forEach(function (entry) {
      window.removeEventListener(entry.type, entry.listener, entry.capture);
    });
    selection.listeners = [];
  }

  function cleanupSelection() {
    if (selection.frame !== null) {
      cancelAnimationFrameSafe(selection.frame);
      selection.frame = null;
    }
    removeSelectionListeners();
    if (selection.highlight && selection.highlight.parentNode) selection.highlight.parentNode.removeChild(selection.highlight);
    if (selection.badge && selection.badge.parentNode) selection.badge.parentNode.removeChild(selection.badge);
    selection.highlight = null;
    selection.badge = null;
    selection.target = null;
    selection.pointer = null;
    if (selection.nav && typeof selection.nav.reset === 'function') selection.nav.reset();
    selection.nav = null;
    selection.active = false;
  }

  function cancelSelection() {
    var wasSelecting = selection.active || toolbarState.get() === 'selecting';
    cleanupSelection();
    if (wasSelecting && toolbarState.cancel()) setStatus('', 'info');
    updateButtons();
  }

  function startExport(mode, element) {
    if (!toolbarState.startExport()) return false;
    cleanupSelection();
    updateButtons();
    (async function () {
      try {
        setStatus(mode === 'page' ? 'Scrolling…' : 'Collecting styles…', 'info');
        var capture = await captureParts(mode, element);
        setStatus('Taking screenshot', 'info');
        var screenshot = await captureScreenshot(mode, element, capture.stats);
        var fileName = cloneLogic && typeof cloneLogic.buildFileName === 'function'
          ? cloneLogic.buildFileName(location.href)
          : 'WebCut-page.html';
        var saveResponse = await sendRuntimeMessage({
          type: messageTypes.savePage,
          meta: {
            type: mode,
            url: location.href,
            title: document.title,
            savedAt: Date.now(),
            fileName: fileName,
          },
          html: capture.html,
          screenshot: screenshot || undefined,
        });
        if (!saveResponse || saveResponse.ok === false) {
          throw new Error(saveResponse && saveResponse.error ? saveResponse.error : 'Save failed');
        }
        lastCapture = {
          id: saveResponse.id || null,
          fileName: fileName,
          title: document.title,
          url: location.href,
          type: mode,
          html: capture.html,
          bytes: byteLength(capture.html),
        };
        var formatBytes = cloneLogic && typeof cloneLogic.formatBytes === 'function'
          ? cloneLogic.formatBytes
          : function (value) { return value + ' B'; };
        var warningText = capture.stats.warningLevel && capture.stats.warningLevel !== 'none'
          ? ' Warning: ' + capture.stats.warningLevel + '.'
          : '';
        setStatus(
          'Saved ' + fileName + ' (' + formatBytes(lastCapture.bytes) + '). '
            + capture.stats.imagesInlined + ' images inlined, ' + capture.stats.imagesKept
            + ' kept as links.' + warningText,
          capture.stats.warningLevel && capture.stats.warningLevel !== 'none' ? 'warning' : 'success',
        );
        try {
          openPreviewModal();
        } catch (previewError) {
          setStatus('Saved ' + fileName + ' (' + formatBytes(lastCapture.bytes) + '). Preview unavailable: '
            + (previewError && previewError.message ? previewError.message : String(previewError)), 'error');
        }
      } catch (error) {
        setStatus('Capture failed: ' + (error && error.message ? error.message : String(error)), 'error');
      } finally {
        if (toolbarState.finish()) updateButtons();
      }
    }());
    return true;
  }

  function createModalButton(label, className, ariaLabel) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    return button;
  }

  function createDrawer() {
    drawer = document.createElement('aside');
    drawer.className = 'content-drawer';
    drawer.setAttribute('aria-label', 'WebCut saved items');
    drawer.setAttribute('aria-hidden', 'true');

    var header = document.createElement('header');
    header.className = 'content-drawer-header';
    var heading = document.createElement('h2');
    heading.textContent = 'Saved items';
    drawerCloseButton = document.createElement('button');
    drawerCloseButton.type = 'button';
    drawerCloseButton.className = 'content-drawer-close';
    drawerCloseButton.textContent = '×';
    drawerCloseButton.setAttribute('aria-label', 'Close saved items');
    header.appendChild(heading);
    header.appendChild(drawerCloseButton);

    drawerFrame = document.createElement('iframe');
    drawerFrame.className = 'content-drawer-frame';
    drawerFrame.title = 'WebCut saved items';
    drawerFrame.src = chrome.runtime.getURL('sidepanel-iframe.html');
    drawer.appendChild(header);
    drawer.appendChild(drawerFrame);
    shadow.appendChild(drawer);
    drawerCloseButton.addEventListener('click', closeDrawer);
    window.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !drawerOpen) return;
      var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      var active = shadow.activeElement;
      if (path.indexOf(drawer) === -1 && active !== drawer && active !== drawerFrame && active !== drawerCloseButton) return;
      event.preventDefault();
      closeDrawer();
    }, true);
  }

  function showDrawer() {
    if (!drawer) return;
    host.hidden = false;
    drawerOpen = true;
    drawer.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(function () {
      if (drawerOpen) drawer.classList.add('is-open');
    });
    drawerCloseButton.focus();
  }

  function closeDrawer() {
    if (!drawer) return;
    drawerOpen = false;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer();
    else showDrawer();
    return drawerOpen;
  }

  function openPreviewModal() {
    if (!lastCapture || typeof lastCapture.html !== 'string' || !lastCapture.html) {
      throw new Error('The saved capture has no HTML preview');
    }
    if (previewModal) closePreviewModal();
    previewRestoreFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'preview-modal-backdrop';
    overlay.setAttribute('role', 'presentation');
    var dialog = document.createElement('section');
    dialog.className = 'preview-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'webcut-preview-title');
    dialog.tabIndex = -1;

    var header = document.createElement('header');
    header.className = 'preview-modal-header';
    var heading = document.createElement('div');
    heading.className = 'preview-modal-heading';
    var brand = document.createElement('div');
    brand.className = 'preview-modal-brand';
    var logo = document.createElement('img');
    logo.className = 'preview-modal-logo';
    logo.src = chrome.runtime.getURL('icons/icon-48.png');
    logo.alt = 'WebCut logo';
    var brandName = document.createElement('span');
    brandName.className = 'preview-modal-brand-name';
    brandName.textContent = 'WebCut';
    var headingText = document.createElement('h2');
    headingText.id = 'webcut-preview-title';
    headingText.className = 'preview-modal-title';
    headingText.textContent = cloneLogic && typeof cloneLogic.previewTitle === 'function'
      ? cloneLogic.previewTitle(lastCapture.title, lastCapture.type)
      : (lastCapture.title || 'Untitled') + ' (' + (lastCapture.type || 'page') + ')';
    brand.appendChild(logo);
    brand.appendChild(brandName);
    heading.appendChild(brand);
    heading.appendChild(headingText);
    var closeButton = createModalButton('×', 'preview-modal-close', 'Close preview');
    header.appendChild(heading);
    header.appendChild(closeButton);

    var info = document.createElement('div');
    info.className = 'preview-modal-info';
    var source = document.createElement('p');
    source.className = 'preview-modal-source';
    source.textContent = lastCapture.url || '';
    source.title = lastCapture.url || '';
    var infoActions = document.createElement('div');
    infoActions.className = 'preview-modal-actions';
    var size = document.createElement('span');
    size.className = 'preview-modal-size';
    size.textContent = cloneLogic && typeof cloneLogic.formatBytes === 'function'
      ? cloneLogic.formatBytes(lastCapture.bytes)
      : lastCapture.bytes + ' B';
    var downloadButton = createModalButton('Download HTML', 'preview-modal-button preview-modal-button-primary');
    var collectionsButton = createModalButton('View in Collections', 'preview-modal-button preview-modal-button-light');
    infoActions.appendChild(size);
    infoActions.appendChild(downloadButton);
    infoActions.appendChild(collectionsButton);
    info.appendChild(source);
    info.appendChild(infoActions);

    var frameWrap = document.createElement('div');
    frameWrap.className = 'preview-modal-body';
    var frame = document.createElement('iframe');
    frame.className = 'preview-modal-frame';
    frame.setAttribute('title', 'Captured page preview');
    var frameUrl = chrome.runtime.getURL('preview-frame.html');
    var targetOrigin = new URL(frameUrl).origin;
    var previewHtml = lastCapture.html;
    frame.addEventListener('load', function () {
      frame.contentWindow.postMessage({ type: 'webcut-preview', html: previewHtml }, targetOrigin);
    }, { once: true });
    frame.src = frameUrl;
    frameWrap.appendChild(frame);

    dialog.appendChild(header);
    dialog.appendChild(info);
    dialog.appendChild(frameWrap);
    overlay.appendChild(dialog);
    shadow.appendChild(overlay);
    previewModal = {
      overlay: overlay,
      dialog: dialog,
      closeButton: closeButton,
      downloadButton: downloadButton,
      collectionsButton: collectionsButton,
      keydown: function (event) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closePreviewModal();
      },
    };
    closeButton.addEventListener('click', closePreviewModal);
    downloadButton.addEventListener('click', downloadLastCapture);
    collectionsButton.addEventListener('click', function () {
      closePreviewModal();
      showDrawer();
    });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePreviewModal();
    });
    window.addEventListener('keydown', previewModal.keydown, true);
    closeButton.focus();
  }

  function closePreviewModal() {
    if (!previewModal) return;
    var current = previewModal;
    previewModal = null;
    window.removeEventListener('keydown', current.keydown, true);
    if (current.overlay && current.overlay.parentNode) current.overlay.parentNode.removeChild(current.overlay);
    lastCapture.html = '';
    var restore = previewRestoreFocus;
    previewRestoreFocus = null;
    if (restore && typeof restore.focus === 'function') restore.focus();
  }

  function downloadLastCapture() {
    if (!lastCapture || typeof lastCapture.html !== 'string' || !lastCapture.html) {
      setStatus('Download unavailable: the preview HTML is no longer available.', 'error');
      return;
    }
    var fileName = lastCapture.fileName || 'WebCut-page.html';
    var objectUrl = null;
    try {
      var blob = new Blob([lastCapture.html], { type: 'text/html;charset=utf-8' });
      objectUrl = window.URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.click();
      setStatus('Downloaded ' + fileName, 'success');
    } catch (error) {
      setStatus('Download failed: ' + (error && error.message ? error.message : String(error)), 'error');
    } finally {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    }
  }

  function cloneForCapture(node) {
    if (!node) throw new Error('Capture target is unavailable');
    if (typeof node.cloneNode !== 'function') throw new Error('Capture target cannot be cloned');
    return node.cloneNode(true);
  }

  function byteLength(value) {
    if (typeof value !== 'string') return 0;
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).length;
    return value.length;
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, milliseconds);
    });
  }

  function waitAnimationFrames(count) {
    var remaining = Math.max(0, Number(count) || 0);
    return new Promise(function (resolve) {
      function next() {
        if (!remaining) {
          resolve();
          return;
        }
        remaining -= 1;
        requestAnimationFrameSafe(next);
      }
      next();
    });
  }

  function dataUrlBytes(value) {
    if (typeof value !== 'string' || value.indexOf('data:') !== 0) return 0;
    var comma = value.indexOf(',');
    if (comma === -1) return 0;
    var payload = value.slice(comma + 1);
    if (/;base64/i.test(value.slice(0, comma))) return Math.floor(payload.replace(/\s/g, '').length * 3 / 4);
    try {
      return byteLength(decodeURIComponent(payload));
    } catch (error) {
      return byteLength(payload);
    }
  }

  function resourceIsFont(url) {
    return /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i.test(String(url || ''));
  }

  function makeResourceStats(cssStats) {
    var sheetsFailed = cssStats.sheetsFailed;
    return {
      sheetsOk: cssStats.sheetsOk,
      sheetsFailed: sheetsFailed,
      failedUrls: cssStats.failedUrls,
      cssBytes: cssStats.cssBytes,
      inlined: 0,
      kept: 0,
      imagesInlined: 0,
      imagesKept: 0,
      failed: sheetsFailed,
      inlineBytes: 0,
      warnings: sheetsFailed ? ['Stylesheet collection failed'] : [],
      warningLevel: sheetsFailed ? 'warning' : 'none',
    };
  }

  function addWarning(stats, message, url) {
    stats.failed += 1;
    stats.warningLevel = 'warning';
    var value = message + (url ? ' (' + url + ')' : '');
    if (stats.warnings.indexOf(value) === -1 && stats.warnings.length < 20) stats.warnings.push(value);
    if (url) addFailedUrl(stats, url);
  }

  function createResourceManager(stats) {
    var cache = new Map();
    var accounted = new Set();
    var active = 0;
    var queue = [];

    function pump() {
      while (active < 6 && queue.length) {
        var item = queue.shift();
        active += 1;
        fetchResource(item.url).then(function (result) {
          item.resolve(result);
        }, function (error) {
          item.resolve({ ok: false, error: error && error.message ? error.message : String(error) });
        }).finally(function () {
          active -= 1;
          pump();
        });
      }
    }

    function fetchResource(url) {
      return sendRuntimeMessage({
        type: messageTypes.fetchResource,
        url: url,
        as: 'dataUrl',
      }).then(function (response) {
        if (!response || response.ok === false || typeof response.dataUrl !== 'string') {
          return { ok: false, error: response && response.error ? response.error : 'Resource fetch failed' };
        }
        return { ok: true, dataUrl: response.dataUrl, bytes: dataUrlBytes(response.dataUrl) };
      });
    }

    function request(url, kind) {
      if (!isHttpUrl(url)) return Promise.resolve({ ok: false, keep: true, error: 'Resource URL is not fetchable' });
      var font = kind === 'font' || resourceIsFont(url);
      var image = kind === 'media' || kind === 'canvas' || kind === 'css-image';
      var fetched = cache.get(url);
      if (!fetched) {
        fetched = new Promise(function (resolve) {
          queue.push({ url: url, resolve: resolve });
          pump();
        });
        cache.set(url, fetched);
      }
      return fetched.then(function (result) {
        if (!result.ok) {
          stats.kept += 1;
          if (image) stats.imagesKept += 1;
          addWarning(stats, result.error || 'Resource fetch failed', url);
          return { ok: false, keep: true };
        }
        var limit = font ? 3 * 1024 * 1024 : 5 * 1024 * 1024;
        if (result.bytes > limit) {
          stats.kept += 1;
          if (image) stats.imagesKept += 1;
          addWarning(stats, font ? 'Font exceeds 3 MB' : 'Resource exceeds 5 MB', url);
          return { ok: false, keep: true };
        }
        if (!accounted.has(url)) {
          if (stats.inlineBytes + result.bytes > 40 * 1024 * 1024) {
            stats.kept += 1;
            if (image) stats.imagesKept += 1;
            addWarning(stats, 'Inline budget exceeded', url);
            return { ok: false, keep: true };
          }
          accounted.add(url);
          stats.inlineBytes += result.bytes;
        }
        stats.inlined += 1;
        if (image) stats.imagesInlined += 1;
        return { ok: true, dataUrl: result.dataUrl };
      });
    }

    function acceptDataUrl(dataUrl, key, kind) {
      var bytes = dataUrlBytes(dataUrl);
      var limit = kind === 'font' ? 3 * 1024 * 1024 : 5 * 1024 * 1024;
      var image = kind === 'media' || kind === 'canvas' || kind === 'css-image';
      if (!bytes || bytes > limit) {
        stats.kept += 1;
        if (image) stats.imagesKept += 1;
        addWarning(stats, kind === 'font' ? 'Font exceeds 3 MB' : 'Resource exceeds 5 MB', key);
        return false;
      }
      if (!accounted.has(key)) {
        if (stats.inlineBytes + bytes > 40 * 1024 * 1024) {
          stats.kept += 1;
          if (image) stats.imagesKept += 1;
          addWarning(stats, 'Inline budget exceeded', key);
          return false;
        }
        accounted.add(key);
        stats.inlineBytes += bytes;
      }
      stats.inlined += 1;
      if (image) stats.imagesInlined += 1;
      return true;
    }

    return { request: request, acceptDataUrl: acceptDataUrl };
  }

  function nodeAtPath(root, path) {
    var node = root;
    for (var i = 0; i < path.length && node; i += 1) node = node.childNodes[path[i]];
    return node || null;
  }

  function nodePath(root, node) {
    var path = [];
    var current = node;
    while (current && current !== root) {
      var parent = current.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return current === root ? path : null;
  }

  function buildMediaPairs(liveRoot, cloneRoot) {
    var pairs = [];
    if (!liveRoot || !cloneRoot) return pairs;
    var selector = 'img,canvas,picture source,video[poster]';
    var liveNodes = [];
    var rootTag = liveRoot.nodeType === 1 ? String(liveRoot.tagName || '').toLowerCase() : '';
    if (rootTag === 'img' || rootTag === 'canvas' || rootTag === 'source'
      || (rootTag === 'video' && liveRoot.hasAttribute('poster'))) liveNodes.push(liveRoot);
    if (typeof liveRoot.querySelectorAll === 'function') liveNodes = liveNodes.concat(Array.prototype.slice.call(liveRoot.querySelectorAll(selector)));
    liveNodes.forEach(function (live) {
      var path = nodePath(liveRoot, live);
      var clone = path ? nodeAtPath(cloneRoot, path) : null;
      if (clone) pairs.push({ live: live, clone: clone });
    });
    return pairs;
  }

  function cssUrlIsFont(css, index) {
    var fontStart = css.toLowerCase().lastIndexOf('@font-face', index);
    var blockEnd = css.lastIndexOf('}', index);
    return fontStart > blockEnd;
  }

  async function inlineCss(css, manager) {
    if (!cloneLogic || typeof cloneLogic.findCssUrls !== 'function'
      || typeof cloneLogic.replaceCssUrls !== 'function') return css;
    var urls = cloneLogic.findCssUrls(css);
    var replacements = Object.create(null);
    await Promise.all(urls.map(function (url) {
      var index = css.indexOf(url);
      var kind = cssUrlIsFont(css, index) || resourceIsFont(url) ? 'font' : 'css-image';
      return manager.request(url, kind).then(function (result) {
        if (result && result.ok) replacements[url] = result.dataUrl;
      });
    }));
    return cloneLogic.replaceCssUrls(css, replacements);
  }

  function documentScrollHeight() {
    return Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0,
    );
  }

  async function performAutoScroll(onProgress) {
    if (!cloneLogic || typeof cloneLogic.computeScrollSteps !== 'function') {
      throw new Error('Clone scroll logic is unavailable');
    }
    if (typeof onProgress !== 'function') onProgress = function () {};
    var originalX = Number.isFinite(window.scrollX) ? window.scrollX : (window.pageXOffset || 0);
    var originalY = Number.isFinite(window.scrollY) ? window.scrollY : (window.pageYOffset || 0);
    var initialHeight = documentScrollHeight();
    var viewportHeight = Math.max(window.innerHeight || 0, 1);
    var passHeight = initialHeight;
    try {
      for (var pass = 0; pass < 2; pass += 1) {
        var steps = cloneLogic.computeScrollSteps(passHeight, viewportHeight);
        for (var index = 0; index < steps.length; index += 1) {
          window.scrollTo({ top: steps[index], behavior: 'instant' });
          await wait(450);
          onProgress(index + 1, steps.length);
        }
        if (pass !== 0) break;
        var firstPassHeight = documentScrollHeight();
        if (!(firstPassHeight > initialHeight * 1.2)) break;
        passHeight = firstPassHeight;
      }
    } finally {
      window.scrollTo({ left: originalX, top: originalY, behavior: 'instant' });
    }
  }

  function isPrintOnly(media) {
    var mediaText = media && typeof media.mediaText === 'string' ? media.mediaText : String(media || '');
    if (!mediaText.trim()) return false;
    return mediaText.split(',').every(function (item) {
      return /^\s*(?:only\s+)?print\s*$/i.test(item);
    });
  }

  function stylesheetIsPrintOnly(sheet) {
    return Boolean(sheet && (isPrintOnly(sheet.media) || isPrintOnly(sheet.mediaText)));
  }

  function sendRuntimeMessage(message) {
    return new Promise(function (resolve, reject) {
      if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        reject(new Error('Resource messaging is unavailable'));
        return;
      }
      var settled = false;
      function finish(error, value) {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(value);
      }
      function callback(response) {
        var lastError = chrome.runtime.lastError;
        if (lastError) finish(new Error(lastError.message || String(lastError)));
        else finish(null, response);
      }
      try {
        var returned = chrome.runtime.sendMessage(message, callback);
        if (returned && typeof returned.then === 'function') returned.then(function (value) {
          finish(null, value);
        }, finish);
      } catch (error) {
        finish(error);
      }
    });
  }

  function absoluteUrl(value, baseUrl) {
    try {
      return new URL(value, baseUrl).href;
    } catch (error) {
      return '';
    }
  }

  function isHttpUrl(value) {
    try {
      var protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  function addFailedUrl(stats, url) {
    if (typeof url !== 'string' || !url) return;
    if (stats.failedUrls.indexOf(url) === -1 && stats.failedUrls.length < 10) {
      stats.failedUrls.push(url);
    }
  }

  function cssBytes(css) {
    return byteLength(css);
  }

  async function collectCss() {
    var chunks = [];
    var stats = { sheetsOk: 0, sheetsFailed: 0, failedUrls: [], cssBytes: 0 };
    var visitedSheets = new Set();
    var visitedHrefs = new Set();

    function sheetHref(sheet, fallback) {
      var value = sheet && typeof sheet.href === 'string' && sheet.href ? sheet.href : fallback;
      return value ? absoluteUrl(value, document.baseURI) : '';
    }

    function markVisited(sheet, href) {
      if (href) {
        if (visitedHrefs.has(href)) return false;
        visitedHrefs.add(href);
        return true;
      }
      if (visitedSheets.has(sheet)) return false;
      visitedSheets.add(sheet);
      return true;
    }

    async function fetchSheet(url) {
      if (!isHttpUrl(url)) throw new Error('Stylesheet URL is not fetchable');
      var response = await sendRuntimeMessage({
        type: messageTypes.fetchResource,
        url: url,
        as: 'text'
      });
      if (!response || response.ok !== true || typeof response.text !== 'string') {
        throw new Error(response && response.error ? response.error : 'Stylesheet fetch failed');
      }
      chunks.push(cloneLogic.absolutizeCssUrls(response.text, url));
      stats.sheetsOk += 1;
    }

    async function processSheet(sheet, depth, fallbackHref) {
      if (!sheet || sheet.disabled || stylesheetIsPrintOnly(sheet)) return;
      var href = sheetHref(sheet, fallbackHref);
      if (!markVisited(sheet, href)) return;
      if (depth > 5) {
        stats.sheetsFailed += 1;
        addFailedUrl(stats, href);
        return;
      }

      var rules;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        if (isHttpUrl(href)) {
          try {
            await fetchSheet(href);
          } catch (fetchError) {
            stats.sheetsFailed += 1;
            addFailedUrl(stats, href);
          }
        } else {
          stats.sheetsFailed += 1;
        }
        return;
      }

      try {
        var ruleText = [];
        for (var i = 0; i < rules.length; i += 1) {
          var rule = rules[i];
          var isImport = Boolean(rule && (rule.type === 3 || rule.styleSheet || typeof rule.href === 'string'));
          if (isImport) {
            var importHref = rule.href ? absoluteUrl(rule.href, href || document.baseURI) : '';
            var importedSheet = null;
            try {
              importedSheet = rule.styleSheet || null;
            } catch (error) {
              importedSheet = null;
            }
            if (importedSheet) {
              await processSheet(importedSheet, depth + 1, importHref);
            } else if (isHttpUrl(importHref)) {
              if (depth + 1 > 5) {
                stats.sheetsFailed += 1;
                addFailedUrl(stats, importHref);
              } else if (markVisited(null, importHref)) {
                try {
                  await fetchSheet(importHref);
                } catch (fetchError) {
                  stats.sheetsFailed += 1;
                  addFailedUrl(stats, importHref);
                }
              }
            } else {
              stats.sheetsFailed += 1;
            }
          } else if (rule && typeof rule.cssText === 'string') {
            ruleText.push(rule.cssText);
          }
        }
        if (ruleText.length) {
          chunks.push(cloneLogic.absolutizeCssUrls(ruleText.join('\n'), href || document.baseURI));
        }
        stats.sheetsOk += 1;
      } catch (error) {
        stats.sheetsFailed += 1;
        addFailedUrl(stats, href);
      }
    }

    var sheets = document.styleSheets ? Array.prototype.slice.call(document.styleSheets) : [];
    for (var i = 0; i < sheets.length; i += 1) await processSheet(sheets[i], 0, '');
    var adopted = document.adoptedStyleSheets ? Array.prototype.slice.call(document.adoptedStyleSheets) : [];
    for (var j = 0; j < adopted.length; j += 1) await processSheet(adopted[j], 0, '');
    var css = chunks.join('\n');
    stats.cssBytes = cssBytes(css);
    return { css: css, stats: stats };
  }

  function isRemovableCloneNode(node) {
    var tag = node && node.nodeType === 1 && String(node.tagName).toLowerCase();
    if (tag === 'script' || tag === 'noscript' || tag === 'webcut-ui-root' || tag === 'style' || tag === 'base') return true;
    if (tag !== 'link') return false;
    var rel = String(node.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
    return rel.indexOf('stylesheet') !== -1 || rel.indexOf('preload') !== -1
      || rel.indexOf('prefetch') !== -1 || rel.indexOf('modulepreload') !== -1;
  }

  function cleanCloneAttributes(node) {
    if (!node.attributes) return;
    var attributes = Array.prototype.slice.call(node.attributes);
    attributes.forEach(function (attribute) {
      var name = String(attribute.name || '').toLowerCase();
      var value = String(attribute.value || '');
      var isHandler = cloneLogic && typeof cloneLogic.isEventHandlerAttr === 'function'
        ? cloneLogic.isEventHandlerAttr(attribute.name)
        : /^on[a-z]+$/i.test(attribute.name);
      if (isHandler) {
        node.removeAttribute(attribute.name);
      } else if ((name === 'href' || name === 'src' || name === 'action')
        && /^\s*javascript\s*:/i.test(value)) {
        node.setAttribute(attribute.name, '#');
      }
    });
  }

  function cleanDomNode(root) {
    if (!root) return root;
    if (root.nodeType === 1) cleanCloneAttributes(root);
    var children = root.childNodes ? Array.prototype.slice.call(root.childNodes) : [];
    children.forEach(function (child) {
      if (child.nodeType !== 1) return;
      if (isRemovableCloneNode(child)) {
        if (child.parentNode) child.parentNode.removeChild(child);
        return;
      }
      cleanCloneAttributes(child);
      if (String(child.tagName).toLowerCase() === 'template' && child.content) cleanDomNode(child.content);
      else if (String(child.tagName).toLowerCase() !== 'iframe') cleanDomNode(child);
    });
    return root;
  }

  function recordAttributes(element) {
    var result = {};
    if (!element || !element.attributes) return result;
    Array.prototype.forEach.call(element.attributes, function (attribute) {
      result[attribute.name] = attribute.value;
    });
    return result;
  }

  function computedElementWidth(element) {
    var computed = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element) : null;
    if (computed && computed.width && computed.width !== 'auto') return computed.width;
    var rect = element && typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
    return rect && Number.isFinite(rect.width) ? rect.width + 'px' : '';
  }

  function copyComputedStyle(live, clone) {
    if (!live || !clone || live.nodeType !== 1 || clone.nodeType !== 1
      || typeof window.getComputedStyle !== 'function' || !clone.style) return;
    var computed;
    try {
      computed = window.getComputedStyle(live);
    } catch (error) {
      return;
    }
    for (var index = 0; index < computed.length; index += 1) {
      var property = computed[index];
      if (!property) continue;
      var value = computed.getPropertyValue(property);
      if (!value) continue;
      try {
        clone.style.setProperty(property, value, 'important');
      } catch (error) {
        // A browser-specific computed property should not abort a capture.
      }
    }
  }

  function pseudoStyleRule(live, clone, pseudo) {
    if (!live || !clone || !clone.dataset || typeof window.getComputedStyle !== 'function') return '';
    var computed;
    try {
      computed = window.getComputedStyle(live, pseudo);
    } catch (error) {
      return '';
    }
    var content = computed.getPropertyValue('content');
    if (!content || content === 'none' || content === 'normal') return '';
    var declarations = [];
    for (var index = 0; index < computed.length; index += 1) {
      var property = computed[index];
      if (!property) continue;
      var value = computed.getPropertyValue(property);
      if (!value) continue;
      declarations.push(property + ':' + value + ' !important');
    }
    if (!declarations.length) return '';
    return '[data-webcut-capture-node="' + clone.dataset.webcutCaptureNode + '"]' + pseudo
      + '{' + declarations.join(';') + '}';
  }

  function captureComputedComponentStyles(liveRoot, cloneRoot) {
    var pseudoRules = [];
    var nodeIndex = 0;

    function visit(live, clone) {
      if (!live || !clone || live.nodeType !== 1 || clone.nodeType !== 1) return;
      clone.dataset.webcutCaptureNode = String(nodeIndex);
      nodeIndex += 1;
      copyComputedStyle(live, clone);
      var before = pseudoStyleRule(live, clone, '::before');
      var after = pseudoStyleRule(live, clone, '::after');
      if (before) pseudoRules.push(before);
      if (after) pseudoRules.push(after);

      var liveChildren = live.children || [];
      var cloneChildren = clone.children || [];
      var count = Math.min(liveChildren.length, cloneChildren.length);
      for (var index = 0; index < count; index += 1) visit(liveChildren[index], cloneChildren[index]);
    }

    visit(liveRoot, cloneRoot);
    return pseudoRules.join('\n');
  }

  async function inlineCloneStyleAttributes(root, manager) {
    if (!root || !manager || !cloneLogic || typeof cloneLogic.findCssUrls !== 'function'
      || typeof cloneLogic.replaceCssUrls !== 'function') return;
    var nodes = [root];
    if (typeof root.querySelectorAll === 'function') {
      nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll('[style]')));
    }
    await Promise.all(nodes.map(async function (node) {
      if (!node || typeof node.getAttribute !== 'function' || typeof node.setAttribute !== 'function') return;
      var styleText = node.getAttribute('style');
      if (!styleText) return;
      if (cloneLogic && typeof cloneLogic.absolutizeCssUrls === 'function') {
        styleText = cloneLogic.absolutizeCssUrls(styleText, document.baseURI);
      }
      var urls = cloneLogic.findCssUrls(styleText);
      var replacements = Object.create(null);
      await Promise.all(urls.map(function (url) {
        return manager.request(url, 'css-image').then(function (result) {
          if (result && result.ok) replacements[url] = result.dataUrl;
        });
      }));
      node.setAttribute('style', cloneLogic.replaceCssUrls(styleText, replacements));
    }));
  }

  function resetHead(head, css) {
    if (!head) return;
    Array.prototype.slice.call(head.querySelectorAll('meta[charset],base,style')).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    var charset = document.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    head.insertBefore(charset, head.firstChild || null);
    var base = document.createElement('base');
    base.setAttribute('href', location.href);
    head.insertBefore(base, charset.nextSibling);
    var style = document.createElement('style');
    style.textContent = css || '';
    head.appendChild(style);
  }

  function markInlineImage(stats) {
    stats.inlined += 1;
    stats.imagesInlined += 1;
  }

  function markKeptImage(stats, message, url) {
    stats.kept += 1;
    stats.imagesKept += 1;
    addWarning(stats, message, url);
  }

  function removeResponsiveAttributes(clone) {
    if (!clone || typeof clone.removeAttribute !== 'function') return;
    var tag = String(clone.tagName || '').toLowerCase();
    if (tag === 'img') {
      clone.removeAttribute('srcset');
      clone.removeAttribute('sizes');
      var picture = clone.parentElement;
      if (picture && String(picture.tagName || '').toLowerCase() === 'picture') {
        Array.prototype.forEach.call(picture.querySelectorAll('source'), function (source) {
          source.removeAttribute('srcset');
        });
      }
    }
  }

  function drawImageDataUrl(image) {
    if (!image || image.complete !== true || !(Number(image.naturalWidth) > 0)) return null;
    var canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    var context = canvas.getContext('2d');
    if (!context || typeof context.drawImage !== 'function') return null;
    context.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function replaceCanvasClone(clone, live, src) {
    var image = document.createElement('img');
    Array.prototype.forEach.call(clone.attributes || [], function (attribute) {
      if (attribute.name !== 'src' && attribute.name !== 'srcset') image.setAttribute(attribute.name, attribute.value);
    });
    if (!image.hasAttribute('width') && live && Number.isFinite(Number(live.width))) {
      image.setAttribute('width', String(live.width));
    }
    if (!image.hasAttribute('height') && live && Number.isFinite(Number(live.height))) {
      image.setAttribute('height', String(live.height));
    }
    if (src) image.setAttribute('src', src);
    if (clone.parentNode) clone.parentNode.replaceChild(image, clone);
    return image;
  }

  async function inlineImages(pairs, manager, stats, onProgress) {
    var mediaPairs = pairs.filter(function (pair) {
      return pair && pair.live && String(pair.live.tagName || '').toLowerCase() !== 'source';
    });
    var completed = 0;
    var progress = typeof onProgress === 'function' ? onProgress : function () {};
    await Promise.all(mediaPairs.map(async function (pair, pairIndex) {
      try {
        var live = pair.live;
        var clone = pair.clone;
        if (!clone) return;
        var tag = String(live.tagName || '').toLowerCase();
        if (tag === 'canvas') {
        var canvasUrl = null;
        try {
          canvasUrl = live.toDataURL('image/png');
        } catch (error) {
          canvasUrl = null;
        }
        if (canvasUrl && canvasUrl.indexOf('data:') === 0) {
          if (manager.acceptDataUrl(canvasUrl, 'canvas:' + pairIndex, 'canvas')) {
            pair.clone = replaceCanvasClone(clone, live, canvasUrl);
          } else {
            replaceCanvasClone(clone, live, '');
          }
        } else {
          replaceCanvasClone(clone, live, '');
          markKeptImage(stats, 'Canvas could not be serialized');
        }
        return;
      }

      var attribute = tag === 'video' ? 'poster' : 'src';
      var sourceUrl = tag === 'video'
        ? (live.getAttribute('poster') || live.poster || '')
        : (live.currentSrc || live.getAttribute('src') || live.src || '');
      if (!sourceUrl) return;
      if (/^data:/i.test(sourceUrl)) {
        clone.setAttribute(attribute, sourceUrl);
        markInlineImage(stats);
        if (tag === 'img') removeResponsiveAttributes(clone);
        return;
      }

      var url = absoluteUrl(sourceUrl, live.baseURI || document.baseURI);
      var safeUrl = /^\s*javascript\s*:/i.test(sourceUrl) ? '#' : (url || sourceUrl);
      var result = null;
      if (tag === 'img' && isHttpUrl(url)) {
        try {
          var drawn = drawImageDataUrl(live);
          if (drawn) {
            if (manager.acceptDataUrl(drawn, 'image:' + pairIndex, 'media')) {
              clone.setAttribute('src', drawn);
            } else {
              clone.setAttribute('src', url);
            }
            removeResponsiveAttributes(clone);
            return;
          }
        } catch (error) {
          result = null;
        }
      }
      if (isHttpUrl(url)) result = await manager.request(url, 'media');
      if (result && result.ok) clone.setAttribute(attribute, result.dataUrl);
      else {
        clone.setAttribute(attribute, safeUrl);
        if (!result || result.keep !== true) markKeptImage(stats, 'Media could not be inlined', safeUrl);
      }
      if (tag === 'img') removeResponsiveAttributes(clone);
      } catch (error) {
        markKeptImage(stats, 'Media could not be inlined');
      } finally {
        completed += 1;
        progress(completed, mediaPairs.length);
      }
    }));
  }

  function visibleRect(element) {
    var rect = element && typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
    if (!rect) return null;
    return {
      x: Number.isFinite(rect.x) ? rect.x : Number(rect.left) || 0,
      y: Number.isFinite(rect.y) ? rect.y : Number(rect.top) || 0,
      width: Math.max(0, Number(rect.width) || 0),
      height: Math.max(0, Number(rect.height) || 0),
    };
  }

  function clipToViewport(rect) {
    if (!rect) return null;
    var viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    var left = Math.max(0, rect.x);
    var top = Math.max(0, rect.y);
    var right = Math.min(viewportWidth, rect.x + rect.width);
    var bottom = Math.min(viewportHeight, rect.y + rect.height);
    return {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  function rectFullyVisible(rect) {
    var width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var height = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    return rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height;
  }

  async function captureScreenshot(mode, element, stats) {
    var originalX = Number.isFinite(window.scrollX) ? window.scrollX : (window.pageXOffset || 0);
    var originalY = Number.isFinite(window.scrollY) ? window.scrollY : (window.pageYOffset || 0);
    var visibilityTargets = [host];
    if (shadow && typeof shadow.querySelectorAll === 'function') {
      Array.prototype.forEach.call(shadow.querySelectorAll('.selection-overlay'), function (overlay) {
        if (visibilityTargets.indexOf(overlay) === -1) visibilityTargets.push(overlay);
      });
    }
    var visibility = visibilityTargets.map(function (target) {
      return { target: target, value: target && target.style ? target.style.visibility : '' };
    });
    try {
      var rect;
      if (mode === 'component') {
        rect = visibleRect(element);
        if (!rectFullyVisible(rect) && element && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          await wait(150);
        }
        rect = clipToViewport(visibleRect(element));
      } else {
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        await wait(0);
        rect = {
          x: 0,
          y: 0,
          width: Math.max(window.innerWidth || document.documentElement.clientWidth || 0, 1),
          height: Math.max(window.innerHeight || document.documentElement.clientHeight || 0, 1),
        };
      }
      if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('Capture target is not visible');
      visibilityTargets.forEach(function (target) {
        if (target && target.style) target.style.visibility = 'hidden';
      });
      await waitAnimationFrames(2);
      var response = await sendRuntimeMessage({
        type: messageTypes.takeScreenshot,
        rect: rect,
        dpr: Math.max(0.5, Math.min(8, Number(window.devicePixelRatio) || 1)),
      });
      if (!response || response.ok === false || typeof response.dataUrl !== 'string') {
        throw new Error(response && response.error ? response.error : 'Screenshot failed');
      }
      return response.dataUrl;
    } catch (error) {
      addWarning(stats, 'Screenshot failed: ' + (error && error.message ? error.message : String(error)));
      return null;
    } finally {
      try {
        window.scrollTo({ left: originalX, top: originalY, behavior: 'instant' });
      } catch (error) {
        addWarning(stats, 'Screenshot scroll position could not be restored');
      }
      visibility.forEach(function (entry) {
        try {
          if (entry.target && entry.target.style) entry.target.style.visibility = entry.value;
        } catch (error) {
          addWarning(stats, 'Screenshot overlay visibility could not be restored');
        }
      });
    }
  }

  async function captureParts(mode, element) {
    if (mode !== 'page' && mode !== 'component') throw new Error('Unknown capture mode');
    if (mode === 'component' && (!element || !isElementConnected(element))) throw new Error('Selected component is no longer available');
    if (mode === 'page') {
      await performAutoScroll(function (index, total) {
        setStatus('Scrolling ' + index + '/' + total, 'info');
      });
    }
    var liveRoot = mode === 'page' ? document.documentElement : element;
    var clone = cloneForCapture(liveRoot);
    if (mode === 'component') setStatus('Freezing component styles…', 'info');
    var componentPseudoCss = mode === 'component'
      ? captureComputedComponentStyles(liveRoot, clone)
      : '';
    var mediaPairs = buildMediaPairs(liveRoot, clone);
    clone = cleanDomNode(clone);
    setStatus('Collecting styles…', 'info');
    var css = await collectCss();
    var htmlAttrs = mode === 'component' ? recordAttributes(document.documentElement) : {};
    var bodyAttrs = mode === 'component' ? recordAttributes(document.body) : {};
    if (mode === 'component') {
      // The source page's inline body/html layout can add an arbitrary offset
      // around the selected node. Keep identity attributes for CSS selectors,
      // but let the standalone component reset control the outer frame.
      delete htmlAttrs.style;
      delete bodyAttrs.style;
    }
    var computedWidth = mode === 'component' ? computedElementWidth(element) : '';
    var stats = makeResourceStats(css.stats);
    var manager = createResourceManager(stats);
    var imageTotal = mediaPairs.filter(function (pair) {
      return pair && pair.live && String(pair.live.tagName || '').toLowerCase() !== 'source';
    }).length;
    setStatus('Inlining images 0/' + imageTotal, 'info');
    css.css = await inlineCss(css.css + (componentPseudoCss ? '\n' + componentPseudoCss : ''), manager);
    if (mode === 'component') await inlineCloneStyleAttributes(clone, manager);
    await inlineImages(mediaPairs, manager, stats, function (current, total) {
      setStatus('Inlining images ' + current + '/' + total, 'info');
    });
    var rootPair = mediaPairs.filter(function (pair) { return pair.live === liveRoot; })[0];
    if (rootPair && rootPair.clone && !rootPair.clone.parentNode) clone = rootPair.clone;
    stats.cssBytes = byteLength(css.css);
    var html;
    if (mode === 'component') {
      if (!cloneLogic || typeof cloneLogic.buildComponentDocument !== 'function') {
        throw new Error('Clone document helper is unavailable');
      }
      html = cloneLogic.buildComponentDocument({
        title: document.title,
        url: location.href,
        htmlAttrs: htmlAttrs,
        bodyAttrs: bodyAttrs,
        css: css.css,
        bodyHtml: clone.outerHTML,
      });
    } else {
      var head = clone.querySelector ? clone.querySelector('head') : null;
      if (!head) {
        head = document.createElement('head');
        clone.insertBefore(head, clone.firstChild || null);
      }
      resetHead(head, css.css);
      html = '<!doctype html>\n' + clone.outerHTML;
    }
    return {
      mode: mode,
      title: document.title,
      url: location.href,
      htmlAttrs: htmlAttrs,
      bodyAttrs: bodyAttrs,
      computedWidth: computedWidth,
      html: html,
      css: css.css,
      stats: stats,
      capturedAt: Date.now(),
    };
  }

  function onSelectionMouseMove(event) {
    if (!selection.active || isToolbarEvent(event)) {
      return;
    }
    selection.pointer = { x: event.clientX, y: event.clientY };
    if (selection.frame !== null) return;
    selection.frame = requestAnimationFrameSafe(function () {
      selection.frame = null;
      if (!selection.active || !selection.pointer) return;
      updateSelectionTarget(selection.pointer.x, selection.pointer.y);
    });
  }

  function updateSelectionTarget(x, y) {
    var elements = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : (typeof document.elementFromPoint === 'function' ? [document.elementFromPoint(x, y)] : []);
    elements = elements.filter(function (element) {
      return element && element !== host && !isToolbarNode(element);
    });
    var nextTarget = pickTarget(elements);
    if (!nextTarget || nextTarget === host || !isElementConnected(nextTarget)) {
      clearSelectionTarget();
      return;
    }
    setSelectionTarget(nextTarget);
    repositionSelection();
  }

  function pickTarget(elements) {
    return selectionLogic && typeof selectionLogic.pickTarget === 'function'
      ? selectionLogic.pickTarget(elements, host)
      : null;
  }

  function describeTarget(element) {
    if (!element || !selectionLogic || typeof selectionLogic.describeElement !== 'function') return 'element';
    var rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : {};
    return selectionLogic.describeElement({
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      width: rect && rect.width,
      height: rect && rect.height
    });
  }

  function setSelectionTarget(element) {
    if (!element || !isElementConnected(element)
      || (selectionLogic && typeof selectionLogic.isSelectable === 'function'
        && !selectionLogic.isSelectable(element, host))) {
      clearSelectionTarget();
      return;
    }
    selection.target = element;
    if (selection.nav && typeof selection.nav.set === 'function') selection.nav.set(element);
  }

  function navigateSelection(direction) {
    if (!selection.nav) return;
    var next = direction === 'up' ? selection.nav.up() : selection.nav.down();
    if (next && isElementConnected(next)) {
      selection.target = next;
      repositionSelection();
    } else {
      clearSelectionTarget();
      setStatus('Hover over an element first.', 'info');
    }
  }

  function repositionSelection() {
    if (!selection.active || !selection.target) return;
    var current = selection.nav && typeof selection.nav.current === 'function'
      ? selection.nav.current()
      : selection.target;
    if (!current || !isElementConnected(current)) {
      clearSelectionTarget();
      return;
    }
    selection.target = current;
    var rect;
    try {
      rect = selection.target.getBoundingClientRect();
    } catch (error) {
      clearSelectionTarget();
      return;
    }
    if (!rect) {
      clearSelectionTarget();
      return;
    }
    var left = Number.isFinite(rect.left) ? rect.left : 0;
    var top = Number.isFinite(rect.top) ? rect.top : 0;
    var width = Number.isFinite(rect.width) ? Math.max(0, rect.width) : Math.max(0, rect.right - rect.left);
    var height = Number.isFinite(rect.height) ? Math.max(0, rect.height) : Math.max(0, rect.bottom - rect.top);
    selection.highlight.hidden = false;
    selection.highlight.style.left = left + 'px';
    selection.highlight.style.top = top + 'px';
    selection.highlight.style.width = width + 'px';
    selection.highlight.style.height = height + 'px';
    selection.badge.textContent = String(describeTarget(selection.target) || 'Element');
    selection.badge.hidden = false;
    var badgeRect = selection.badge.getBoundingClientRect();
    var viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    var badgeWidth = badgeRect.width || Math.min(240, Math.max(80, selection.badge.textContent.length * 7));
    var badgeHeight = badgeRect.height || 24;
    var badgeLeft = clamp(left, 8, Math.max(8, viewportWidth - badgeWidth - 8));
    var badgeTop = top - badgeHeight - 8;
    if (badgeTop < 8) badgeTop = Math.min(viewportHeight - badgeHeight - 8, (rect.bottom || top + height) + 8);
    badgeTop = clamp(badgeTop, 8, Math.max(8, viewportHeight - badgeHeight - 8));
    selection.badge.style.left = badgeLeft + 'px';
    selection.badge.style.top = badgeTop + 'px';
  }

  function clearSelectionTarget() {
    selection.target = null;
    if (selection.nav && typeof selection.nav.reset === 'function') selection.nav.reset();
    if (selection.highlight) selection.highlight.hidden = true;
    if (selection.badge) selection.badge.hidden = true;
  }

  function onSelectionClick(event) {
    if (!selection.active || isToolbarEvent(event)) return;
    blockSelectionEvent(event);
    if (selection.nav && typeof selection.nav.current === 'function') selection.target = selection.nav.current();
    if (selection.target && isElementConnected(selection.target)) {
      startExport('component', selection.target);
    } else {
      clearSelectionTarget();
    }
  }

  function blockSelectionEvent(event) {
    if (!selection.active || isToolbarEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }

  function onSelectionKeyDown(event) {
    if (!selection.active) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== 'Escape') return;
    if (isToolbarEvent(event) && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      cancelSelection();
    } else if (event.key === 'ArrowUp') {
      navigateSelection('up');
    } else if (event.key === 'ArrowDown') {
      navigateSelection('down');
    } else if (event.key === 'Enter' && selection.target && isElementConnected(selection.target)) {
      startExport('component', selection.target);
    }
  }

  function isToolbarEvent(event) {
    var path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (!path.length && event && event.target) return isToolbarNode(event.target);
    return path.indexOf(toolbar) !== -1 || path.indexOf(host) !== -1 || path.some(isToolbarNode);
  }

  function isToolbarNode(node) {
    return node === toolbar || node === host || (node && node.nodeType && toolbar && typeof toolbar.contains === 'function' && toolbar.contains(node));
  }

  function isElementConnected(element) {
    return Boolean(element && element.isConnected !== false);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function requestAnimationFrameSafe(callback) {
    return typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(callback)
      : window.setTimeout(callback, 16);
  }

  function cancelAnimationFrameSafe(frame) {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
    else window.clearTimeout(frame);
  }

  function setStatus(message, level) {
    status.textContent = message;
    status.dataset.level = level || 'info';
  }

  function setExtensionDisabled(disabled) {
    extensionDisabled = disabled === true;
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local
      || typeof chrome.storage.local.set !== 'function') {
      console.error('WebCut activation storage is unavailable.');
      return;
    }
    var values = {};
    values[extensionDisabledKey] = disabled === true;
    chrome.storage.local.set(values, function () {
      var lastError = chrome.runtime && chrome.runtime.lastError;
      if (lastError) console.error('WebCut could not save activation state:', lastError.message || String(lastError));
    });
  }

  function activateExtension() {
    manuallyActivated = true;
    setExtensionDisabled(false);
  }

  function showToolbarWhenEnabled(onEnabled) {
    if (manuallyActivated) {
      extensionDisabled = false;
      onEnabled();
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local
      || typeof chrome.storage.local.get !== 'function') {
      extensionDisabled = false;
      onEnabled();
      return;
    }
    chrome.storage.local.get([extensionDisabledKey], function (values) {
      var lastError = chrome.runtime && chrome.runtime.lastError;
      if (manuallyActivated) return;
      if (lastError) {
        console.error('WebCut could not read activation state:', lastError.message || String(lastError));
        return;
      }
      extensionDisabled = values && values[extensionDisabledKey] === true;
      if (extensionDisabled) return;
      onEnabled();
    });
  }

  function showToolbar() {
    host.hidden = false;
    setStatus(statusDefault, 'info');
  }

  function showFallback() {
    toolbar.classList.add('fallback');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;font:14px/1.4 system-ui,sans-serif;color:#fff;';
    toolbar.style.cssText = 'display:block;position:fixed;top:8px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 16px);box-sizing:border-box;padding:16px;pointer-events:auto;overflow:visible;background:#171a24;border:1px solid #3b4255;border-radius:12px;box-shadow:0 18px 50px rgb(0 0 0 / 34%);';
    setStatus('WebCut styles could not load. Using fallback styles.', 'error');
    showToolbarWhenEnabled(function () {
      host.hidden = false;
    });
  }

  function createFallbackState() {
    var current = 'idle';
    var listeners = [];
    function change(next, allowed) {
      if (allowed.indexOf(current) === -1) return false;
      current = next;
      listeners.slice().forEach(function (listener) { listener(current); });
      return true;
    }
    return {
      get: function () { return current; },
      startSelecting: function () { return change('selecting', ['idle']); },
      startExport: function () { return change('exporting', ['idle', 'selecting']); },
      cancel: function () { return change('idle', ['selecting']); },
      finish: function () { return change('idle', ['exporting']); },
      subscribe: function (listener) {
        listeners.push(listener);
        return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
      }
    };
  }
}());
