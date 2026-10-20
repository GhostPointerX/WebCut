(function () {
  'use strict';

  var logic = typeof WebCutPopupLogic !== 'undefined' ? WebCutPopupLogic : null;
  var messageTypes = typeof WC !== 'undefined' && WC.MSG ? WC.MSG : {};
  var elements = {
    pageCount: document.getElementById('page-count'),
    componentCount: document.getElementById('component-count'),
    clonePage: document.getElementById('clone-page'),
    cloneComponent: document.getElementById('clone-component'),
    openSaved: document.getElementById('open-saved'),
    status: document.getElementById('status'),
    hostUrl: document.getElementById('host-url'),
    hostError: document.getElementById('host-error'),
    useContentSidePanel: document.getElementById('use-content-side-panel'),
    settingsSaved: document.getElementById('settings-saved'),
    clearData: document.getElementById('clear-data'),
    clearConfirm: document.getElementById('clear-confirm'),
    cancelClear: document.getElementById('cancel-clear'),
    deleteEverything: document.getElementById('delete-everything')
  };
  var settings = { hostUrl: '', useContentSidePanel: false };
  var settingsReady = false;
  var activeTabId = null;
  var tabQueryDone = false;
  var requestCount = 0;
  var initialDone = 0;
  var initialFailed = false;
  var saveTimer = null;
  var savedTimer = null;

  function setStatus(message, level) {
    elements.status.textContent = message;
    elements.status.dataset.level = level || 'info';
  }

  function friendlyError(response) {
    return logic && typeof logic.friendlyError === 'function'
      ? logic.friendlyError(response)
      : 'Something went wrong';
  }

  function changeRequestCount(delta) {
    requestCount = Math.max(0, requestCount + delta);
    refreshDisabled();
  }

  function refreshDisabled() {
    var requestBusy = requestCount > 0;
    var captureDisabled = requestBusy || !tabQueryDone;
    elements.clonePage.disabled = captureDisabled;
    elements.cloneComponent.disabled = captureDisabled;
    elements.openSaved.disabled = requestBusy || !tabQueryDone || !settingsReady;
    elements.clearData.disabled = requestBusy;
    elements.cancelClear.disabled = requestBusy;
    elements.deleteEverything.disabled = requestBusy;
    elements.hostUrl.disabled = requestBusy || !settingsReady;
    elements.useContentSidePanel.disabled = requestBusy || !settingsReady;
  }

  function sendRuntimeMessage(message, callback) {
    changeRequestCount(1);
    try {
      chrome.runtime.sendMessage(message, function (response) {
        var lastError = chrome.runtime.lastError;
        changeRequestCount(-1);
        if (lastError) {
          callback({ ok: false, error: lastError.message || 'The request failed.' });
          return;
        }
        callback(response && typeof response === 'object' ? response : { ok: false });
      });
    } catch (error) {
      changeRequestCount(-1);
      callback({ ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  function queryActiveTab(callback) {
    changeRequestCount(1);
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var lastError = chrome.runtime.lastError;
        changeRequestCount(-1);
        tabQueryDone = true;
        refreshDisabled();
        if (lastError) {
          callback({ ok: false, reason: 'no-tab', error: lastError.message || 'No active tab was found.' });
          return;
        }
        var tab = Array.isArray(tabs) ? tabs[0] : null;
        if (!tab || !Number.isInteger(tab.id)) {
          callback({ ok: false, reason: 'no-tab' });
          return;
        }
        activeTabId = tab.id;
        callback({ ok: true, tabId: tab.id });
      });
    } catch (error) {
      changeRequestCount(-1);
      tabQueryDone = true;
      refreshDisabled();
      callback({ ok: false, reason: 'no-tab', error: error && error.message ? error.message : String(error) });
    }
  }

  function finishInitialTask(failed) {
    initialDone += 1;
    if (failed) initialFailed = true;
    if (initialDone === 3 && !initialFailed) setStatus('Ready.', 'info');
  }

  function renderCounts(pages) {
    var counts = logic && typeof logic.countByType === 'function'
      ? logic.countByType(pages)
      : { pages: 0, components: 0 };
    elements.pageCount.textContent = String(counts.pages);
    elements.componentCount.textContent = String(counts.components);
  }

  function loadPages() {
    sendRuntimeMessage({ type: messageTypes.getPages }, function (response) {
      if (!response || response.ok === false) {
        setStatus(friendlyError(response), 'error');
        finishInitialTask(true);
        return;
      }
      renderCounts(response.pages);
      finishInitialTask(false);
    });
  }

  function loadSettings() {
    sendRuntimeMessage({ type: messageTypes.getSettings }, function (response) {
      if (!response || response.ok === false) {
        setStatus(friendlyError(response), 'error');
        finishInitialTask(true);
        return;
      }
      var loaded = response.settings && typeof response.settings === 'object' ? response.settings : {};
      var hostUrl = typeof loaded.hostUrl === 'string' ? loaded.hostUrl : '';
      var normalized = logic && typeof logic.normalizeHostUrl === 'function'
        ? logic.normalizeHostUrl(hostUrl)
        : hostUrl;
      settings = {
        hostUrl: normalized === null ? '' : normalized,
        useContentSidePanel: loaded.useContentSidePanel === true
      };
      settingsReady = true;
      elements.hostUrl.value = settings.hostUrl;
      elements.useContentSidePanel.checked = settings.useContentSidePanel;
      refreshDisabled();
      finishInitialTask(false);
    });
  }

  function startCapture(action) {
    if (requestCount > 0) return;
    setStatus(action === 'page' ? 'Starting full-page capture…' : 'Starting component selection…', 'info');
    queryActiveTab(function (tabResponse) {
      if (!tabResponse || tabResponse.ok === false) {
        setStatus(friendlyError(tabResponse), 'error');
        return;
      }
      sendRuntimeMessage({
        type: messageTypes.toggleToolbar,
        tabId: tabResponse.tabId,
        action: action
      }, function (response) {
        if (!response || response.ok === false) {
          setStatus(friendlyError(response), 'error');
          return;
        }
        if (response.busy) {
          setStatus('A capture or selection is already running.', 'info');
          return;
        }
        setStatus(action === 'page' ? 'Full-page capture started.' : 'Select an element on the page.', 'success');
        window.close();
      });
    });
  }

  function openSavedItems() {
    if (!settingsReady) {
      setStatus('Settings are still loading. Try again in a moment.', 'error');
      return;
    }
    if (!Number.isInteger(activeTabId)) {
      setStatus(friendlyError({ ok: false, reason: 'no-tab' }), 'error');
      return;
    }
    if (settings.useContentSidePanel) {
      setStatus('Opening saved items…', 'info');
      sendRuntimeMessage({ type: messageTypes.toggleDrawer, tabId: activeTabId }, function (response) {
        if (!response || response.ok === false) {
          setStatus(friendlyError(response), 'error');
          return;
        }
        setStatus('Saved items opened.', 'success');
      });
      return;
    }
    if (!chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') {
      setStatus('The browser side panel is unavailable. Enable the in-page drawer in Settings instead.', 'error');
      return;
    }

    setStatus('Opening saved items…', 'info');
    changeRequestCount(1);
    var result;
    try {
      result = chrome.sidePanel.open({ tabId: activeTabId });
    } catch (error) {
      changeRequestCount(-1);
      setStatus('Unable to open Saved Items: ' + (error && error.message ? error.message : String(error)), 'error');
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(function () {
        changeRequestCount(-1);
        setStatus('Saved items opened.', 'success');
      }, function (error) {
        changeRequestCount(-1);
        setStatus('Unable to open Saved Items: ' + (error && error.message ? error.message : String(error)), 'error');
      });
    } else {
      changeRequestCount(-1);
      setStatus('Saved items opened.', 'success');
    }
  }

  function showHostError(message) {
    elements.hostError.textContent = message;
    elements.hostError.hidden = !message;
  }

  function scheduleSettingsSave() {
    if (!settingsReady) return;
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (savedTimer !== null) {
      window.clearTimeout(savedTimer);
      savedTimer = null;
    }
    elements.settingsSaved.hidden = true;
    var normalized = logic && typeof logic.normalizeHostUrl === 'function'
      ? logic.normalizeHostUrl(elements.hostUrl.value)
      : elements.hostUrl.value.trim();
    if (normalized === null) {
      showHostError('Enter a valid https URL or leave this field blank.');
      return;
    }
    showHostError('');
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      var latest = logic && typeof logic.normalizeHostUrl === 'function'
        ? logic.normalizeHostUrl(elements.hostUrl.value)
        : elements.hostUrl.value.trim();
      if (latest === null) {
        showHostError('Enter a valid https URL or leave this field blank.');
        return;
      }
      sendRuntimeMessage({
        type: messageTypes.saveSettings,
        settings: {
          hostUrl: latest,
          useContentSidePanel: elements.useContentSidePanel.checked
        }
      }, function (response) {
        if (!response || response.ok === false) {
          setStatus(friendlyError(response), 'error');
          return;
        }
        settings = {
          hostUrl: latest,
          useContentSidePanel: elements.useContentSidePanel.checked
        };
        if (response.settings && typeof response.settings === 'object') {
          if (typeof response.settings.hostUrl === 'string') settings.hostUrl = response.settings.hostUrl;
          settings.useContentSidePanel = response.settings.useContentSidePanel === true;
        }
        elements.hostUrl.value = settings.hostUrl;
        elements.useContentSidePanel.checked = settings.useContentSidePanel;
        elements.settingsSaved.hidden = false;
        setStatus('Settings saved.', 'success');
        savedTimer = window.setTimeout(function () {
          elements.settingsSaved.hidden = true;
          savedTimer = null;
        }, 1800);
      });
    }, 400);
  }

  function showClearConfirmation() {
    if (requestCount > 0) return;
    elements.clearData.hidden = true;
    elements.clearConfirm.hidden = false;
    elements.cancelClear.focus();
  }

  function cancelClear() {
    elements.clearConfirm.hidden = true;
    elements.clearData.hidden = false;
    elements.clearData.focus();
  }

  function deleteEverything() {
    if (requestCount > 0) return;
    setStatus('Clearing saved data…', 'info');
    sendRuntimeMessage({ type: messageTypes.clearAllData }, function (response) {
      if (!response || response.ok === false) {
        setStatus(friendlyError(response), 'error');
        return;
      }
      sendRuntimeMessage({ type: messageTypes.getPages }, function (pagesResponse) {
        if (!pagesResponse || pagesResponse.ok === false) {
          setStatus(friendlyError(pagesResponse), 'error');
          return;
        }
        renderCounts(pagesResponse.pages);
        elements.clearConfirm.hidden = true;
        elements.clearData.hidden = false;
        setStatus('All data cleared.', 'success');
      });
    });
  }

  elements.clonePage.addEventListener('click', function () { startCapture('page'); });
  elements.cloneComponent.addEventListener('click', function () { startCapture('component'); });
  elements.openSaved.addEventListener('click', openSavedItems);
  elements.hostUrl.addEventListener('input', scheduleSettingsSave);
  elements.useContentSidePanel.addEventListener('change', scheduleSettingsSave);
  elements.clearData.addEventListener('click', showClearConfirmation);
  elements.cancelClear.addEventListener('click', cancelClear);
  elements.deleteEverything.addEventListener('click', deleteEverything);

  refreshDisabled();
  queryActiveTab(function (response) {
    if (!response || response.ok === false) {
      setStatus(friendlyError(response), 'error');
      finishInitialTask(true);
      return;
    }
    finishInitialTask(false);
  });
  loadPages();
  loadSettings();
}());
