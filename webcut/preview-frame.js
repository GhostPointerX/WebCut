const previewBody = document.body;
let previewFrame = null;

document.documentElement.style.width = '100%';
document.documentElement.style.height = '100%';
previewBody.style.width = '100%';
previewBody.style.height = '100%';
previewBody.style.margin = '0';

function isPreviewMessage(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const keys = Object.keys(data);
  return (
    keys.length === 2 &&
    keys.includes('type') &&
    keys.includes('html') &&
    data.type === 'webcut-preview' &&
    typeof data.html === 'string'
  );
}

function showError() {
  previewFrame = null;
  previewBody.textContent = 'Preview unavailable: expected HTML.';
}

function showPreview(html) {
  if (!previewFrame) {
    previewBody.textContent = '';
    previewFrame = document.createElement('iframe');
    previewFrame.setAttribute('sandbox', '');
    previewFrame.setAttribute('title', 'WebCut capture preview');
    previewFrame.style.width = '100%';
    previewFrame.style.height = '100%';
    previewFrame.style.border = '0';
    previewBody.appendChild(previewFrame);
  }

  previewFrame.srcdoc = html;
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.origin !== window.location.origin) {
    return;
  }

  if (!isPreviewMessage(event.data)) {
    showError();
    return;
  }

  showPreview(event.data.html);
});
