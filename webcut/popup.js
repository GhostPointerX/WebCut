// Temporary Step 4 toolbar trigger; replaced by the popup flow in a later step.
(function () {
  'use strict';

  var button = document.getElementById('toggle-toolbar');
  var status = document.getElementById('status');
  if (!button || !status) return;

  button.addEventListener('click', function () {
    button.disabled = true;
    status.textContent = 'Toggling toolbar…';
    chrome.runtime.sendMessage({ type: WC.MSG.toggleToolbar }, function (response) {
      button.disabled = false;
      if (chrome.runtime.lastError) {
        status.textContent = 'Unable to toggle toolbar.';
        return;
      }
      status.textContent = response && response.ok === false
        ? (response.error || 'Unable to toggle toolbar.')
        : 'Toolbar toggled.';
    });
  });
}());
