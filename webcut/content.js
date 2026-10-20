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
    host.hidden = false;
    return;
  }
  host.hidden = true;

  var stateApi = typeof WebCutToolbarState !== 'undefined' ? WebCutToolbarState : null;
  var toolbarState = stateApi ? stateApi.createToolbarState() : createFallbackState();
  var messageTypes = typeof WC !== 'undefined' && WC.MSG ? WC.MSG : {};
  var cloneLogic = typeof WebCutCloneLogic !== 'undefined'
    ? WebCutCloneLogic
    : (typeof window !== 'undefined' ? window.WebCutCloneLogic : null);
  var toolbar;
  var status;
  var statusDefault = 'Ready.';
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

  var stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('content.css');
  stylesheet.addEventListener('load', showToolbar, { once: true });
  stylesheet.addEventListener('error', showFallback, { once: true });
  shadow.appendChild(stylesheet);

  toolbar = document.createElement('section');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'WebCut toolbar');
  toolbar.setAttribute('aria-describedby', 'webcut-status');

  var header = document.createElement('div');
  header.className = 'toolbar-header';
  var title = document.createElement('h1');
  title.textContent = 'WebCut';
  header.appendChild(title);
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

  closeButton.addEventListener('click', function () {
    cancelSelection();
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
    setStatus('Saved items panel comes in a later step', 'info');
  });

  toolbarState.subscribe(function () {
    updateButtons();
  });
  updateButtons();

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return undefined;
    if (message.type === messageTypes.toggleToolbar) {
      host.hidden = !host.hidden;
      sendResponse({ ok: true, visible: !host.hidden });
      return false;
    }
    if (message.type === messageTypes.toggleDrawer) {
      sendResponse({ ok: false, error: 'Drawer is not available yet' });
      return false;
    }
    return undefined;
  });

  window.addEventListener('pagehide', function () {
    cancelSelection();
  }, true);

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
        var htmlKb = Math.ceil(byteLength(capture.html) / 1024);
        var cssKb = Math.ceil(byteLength(capture.css) / 1024);
        setStatus(
          'Captured ' + htmlKb + ' KB HTML, ' + cssKb + ' KB CSS, '
            + capture.stats.sheetsOk + ' sheets ok, ' + capture.stats.sheetsFailed
            + ' failed. Saving comes in the next step.',
          'success',
        );
      } catch (error) {
        setStatus('Capture failed: ' + (error && error.message ? error.message : String(error)), 'error');
      } finally {
        if (toolbarState.finish()) updateButtons();
      }
    }());
    return true;
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

  async function captureParts(mode, element) {
    if (mode !== 'page' && mode !== 'component') throw new Error('Unknown capture mode');
    if (mode === 'component' && (!element || !isElementConnected(element))) throw new Error('Selected component is no longer available');
    if (mode === 'page') {
      await performAutoScroll(function (index, total) {
        setStatus('Scrolling ' + index + '/' + total, 'info');
      });
    }
    var clone = cleanDomNode(cloneForCapture(mode === 'page' ? document.documentElement : element));
    setStatus('Collecting styles…', 'info');
    var css = await collectCss();
    var htmlAttrs = mode === 'component' ? recordAttributes(document.documentElement) : {};
    var bodyAttrs = mode === 'component' ? recordAttributes(document.body) : {};
    var computedWidth = mode === 'component' ? computedElementWidth(element) : '';
    var stats = {
      sheetsOk: css.stats.sheetsOk,
      sheetsFailed: css.stats.sheetsFailed,
      failedUrls: css.stats.failedUrls,
      cssBytes: css.stats.cssBytes,
    };
    return {
      mode: mode,
      title: document.title,
      url: location.href,
      htmlAttrs: htmlAttrs,
      bodyAttrs: bodyAttrs,
      computedWidth: computedWidth,
      html: clone.outerHTML,
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

  function showToolbar() {
    host.hidden = false;
    setStatus(statusDefault, 'info');
  }

  function showFallback() {
    toolbar.classList.add('fallback');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;font:14px/1.4 system-ui,sans-serif;color:#fff;';
    toolbar.style.cssText = 'display:block;position:fixed;top:8px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 16px);box-sizing:border-box;padding:16px;pointer-events:auto;overflow:visible;background:#171a24;border:1px solid #3b4255;border-radius:12px;box-shadow:0 18px 50px rgb(0 0 0 / 34%);';
    setStatus('WebCut styles could not load. Using fallback styles.', 'error');
    host.hidden = false;
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
