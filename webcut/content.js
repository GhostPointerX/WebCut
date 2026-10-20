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
    if (mode === 'component') {
      setStatus('Selected ' + describeTarget(element) + '. Capture comes in a later step.', 'success');
    } else {
      setStatus('Full page capture comes in a later step', 'info');
    }
    updateButtons();
    setTimeout(function () {
      if (toolbarState.finish()) updateButtons();
    }, 120);
    return true;
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
