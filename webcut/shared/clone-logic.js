'use strict';

(function (root) {
  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function shouldLeaveCssUrl(value) {
    return /^(?:data:|blob:|https?:|#)/i.test(value);
  }

  function absolutizeUrl(value, baseUrl) {
    if (typeof value !== 'string') return value;
    var trimmed = value.trim();
    if (!trimmed || shouldLeaveCssUrl(trimmed)) return value;
    try {
      return new URL(trimmed, baseUrl).href;
    } catch (error) {
      return value;
    }
  }

  function absolutizeCssUrls(cssText, baseUrl) {
    if (typeof cssText !== 'string' || typeof baseUrl !== 'string') return cssText;

    try {
      new URL(baseUrl);
    } catch (error) {
      return cssText;
    }

    var result = cssText.replace(/url\((\s*)(?:(['"])([\s\S]*?)\2|([^)]*?))(\s*)\)/gi, function (match, leading, quote, quotedValue, unquotedValue, trailing) {
      var value = quote ? quotedValue : unquotedValue;
      var nextValue = absolutizeUrl(value, baseUrl);
      return 'url(' + leading + (quote ? quote + nextValue + quote : nextValue) + trailing + ')';
    });

    return result.replace(/(@import\s*)(['"])([^'"]*?)\2/gi, function (match, prefix, quote, value) {
      return prefix + quote + absolutizeUrl(value, baseUrl) + quote;
    });
  }

  function computeScrollSteps(scrollHeight, viewportHeight, ratio, maxSteps) {
    var overlapRatio = ratio === undefined ? 0.7 : ratio;
    var limit = maxSteps === undefined ? 60 : maxSteps;
    if (!isFiniteNumber(scrollHeight) || !isFiniteNumber(viewportHeight)
      || !isFiniteNumber(overlapRatio) || !isFiniteNumber(limit)
      || scrollHeight <= 0 || viewportHeight <= 0 || overlapRatio <= 0 || limit <= 0) {
      return [0];
    }

    var lastPosition = Math.max(0, scrollHeight - viewportHeight);
    if (lastPosition === 0) return [0];

    var step = viewportHeight * overlapRatio;
    var naturalCount = Math.ceil(lastPosition / step) + 1;
    var count = Math.min(Math.max(1, Math.floor(limit)), naturalCount);
    if (count === 1) return [lastPosition];

    var steps = [];
    for (var index = 0; index < count - 1; index += 1) {
      steps.push(Math.min(lastPosition, index * step));
    }
    steps.push(lastPosition);
    return steps;
  }

  function isEventHandlerAttr(name) {
    return typeof name === 'string' && name !== 'on' && /^on[a-z]+$/i.test(name);
  }

  var API = {
    absolutizeCssUrls: absolutizeCssUrls,
    computeScrollSteps: computeScrollSteps,
    isEventHandlerAttr: isEventHandlerAttr
  };

  if (root) root.WebCutCloneLogic = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null));
