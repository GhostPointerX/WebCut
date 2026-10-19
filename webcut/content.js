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
    host.hidden = true;
    setStatus('Toolbar hidden.', 'info');
  });
  componentButton.addEventListener('click', function () {
    if (toolbarState.startSelecting()) setStatus('Select mode (stub)', 'info');
    updateButtons();
  });
  fullPageButton.addEventListener('click', function () {
    if (!toolbarState.startExport()) return;
    setStatus('Full page capture comes in a later step', 'info');
    updateButtons();
    setTimeout(function () {
      if (toolbarState.finish()) updateButtons();
    }, 120);
  });
  cancelButton.addEventListener('click', function () {
    if (toolbarState.cancel()) setStatus('Cancelled.', 'info');
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

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !host.hidden && toolbarState.get() === 'selecting') {
      if (toolbarState.cancel()) setStatus('Cancelled.', 'info');
      updateButtons();
    }
  });

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
    fullPageButton.disabled = current === 'exporting';
    componentButton.disabled = current !== 'idle';
    cancelButton.disabled = current !== 'selecting';
    savedButton.disabled = current !== 'idle';
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
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:14px/1.4 system-ui,sans-serif;color:#fff;';
    toolbar.style.cssText = 'display:block;position:absolute;top:16px;left:50%;transform:translateX(-50%);width:min(430px,calc(100% - 32px));padding:16px;pointer-events:auto;background:#171a24;border:1px solid #3b4255;border-radius:12px;box-shadow:0 18px 50px rgb(0 0 0 / 34%);';
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
