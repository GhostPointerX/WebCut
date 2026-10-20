// Temporary Step 4 toolbar trigger; replaced by the popup flow in a later step.
(function () {
  'use strict';

  var button = document.getElementById('toggle-toolbar');
  var status = document.getElementById('status');
  if (!button || !status) return;

  button.addEventListener('click', function () {
    button.disabled = true;
    status.textContent = 'Toggling toolbar…';
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (chrome.runtime.lastError || !tabs || !tabs[0] || !Number.isInteger(tabs[0].id)) {
        button.disabled = false;
        status.textContent = 'No active tab was found. Click on a web page and try again.';
        return;
      }
      chrome.runtime.sendMessage({ type: WC.MSG.toggleToolbar, tabId: tabs[0].id }, function (response) {
        button.disabled = false;
        if (chrome.runtime.lastError) {
          status.textContent = chrome.runtime.lastError.message || 'Unable to toggle toolbar.';
          return;
        }
        status.textContent = response && response.ok === false
          ? (response.error || 'Unable to toggle toolbar.')
          : 'Toolbar toggled.';
      });
    });
  });
}());
