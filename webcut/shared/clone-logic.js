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

  function stringValue(value) {
    if (value === null || value === undefined) return '';
    try {
      return String(value);
    } catch (error) {
      return '';
    }
  }

  function escapeHtml(value) {
    return stringValue(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isAbsoluteHttpUrl(value) {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
    try {
      var parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
    } catch (error) {
      return false;
    }
  }

  function buildFileName(url) {
    if (typeof url !== 'string') return 'WebCut-page.html';
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'WebCut-page.html';
      var hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      hostname = hostname.replace(/[^a-z0-9.-]/g, '-');
      if (!hostname) return 'WebCut-page.html';
      return 'WebCut-' + hostname + '.html';
    } catch (error) {
      return 'WebCut-page.html';
    }
  }

  function isSafeAttributeName(name) {
    return typeof name === 'string'
      && /^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(name)
      && !isEventHandlerAttr(name);
  }

  function attrsToString(attrsObject) {
    if (!attrsObject || (typeof attrsObject !== 'object' && typeof attrsObject !== 'function')) return '';
    var names;
    try {
      names = Object.keys(attrsObject);
    } catch (error) {
      return '';
    }
    return names.reduce(function (result, name) {
      if (!isSafeAttributeName(name)) return result;
      var value;
      try {
        value = attrsObject[name];
      } catch (error) {
        return result;
      }
      return result + ' ' + name + '="' + escapeHtml(value) + '"';
    }, '');
  }

  function cssUrlMatches(css) {
    if (typeof css !== 'string') return [];
    var matches = [];
    var urlPattern = /url\((\s*)(?:(['"])([\s\S]*?)\2|([^)]*?))(\s*)\)/gi;
    var match;
    while ((match = urlPattern.exec(css)) !== null) {
      matches.push({
        start: match.index,
        end: urlPattern.lastIndex,
        leading: match[1],
        quote: match[2] || '',
        value: match[2] ? match[3] : match[4],
        trailing: match[5]
      });
    }
    return matches;
  }

  function findCssUrls(css) {
    var matches = cssUrlMatches(css);
    var seen = Object.create(null);
    var urls = [];
    matches.forEach(function (match) {
      var value = stringValue(match.value).trim();
      if (!isAbsoluteHttpUrl(value) || seen[value]) return;
      seen[value] = true;
      urls.push(value);
    });
    return urls;
  }

  function lookupReplacement(map, value) {
    if (!map) return { found: false };
    if (typeof map.has === 'function' && typeof map.get === 'function') {
      if (!map.has(value)) return { found: false };
      return { found: true, value: map.get(value) };
    }
    if (typeof map !== 'object' && typeof map !== 'function') return { found: false };
    if (!Object.prototype.hasOwnProperty.call(map, value)) return { found: false };
    return { found: true, value: map[value] };
  }

  function replaceCssUrls(css, map) {
    if (typeof css !== 'string') return css;
    var result = css.replace(/url\((\s*)(?:(['"])([\s\S]*?)\2|([^)]*?))(\s*)\)/gi,
      function (match, leading, quote, quotedValue, unquotedValue, trailing) {
        var value = (quote ? quotedValue : unquotedValue).trim();
        if (!isAbsoluteHttpUrl(value)) return match;
        var replacement = lookupReplacement(map, value);
        if (!replacement.found || replacement.value === null || replacement.value === undefined) return match;
        return 'url(' + leading + (quote || '') + stringValue(replacement.value) + (quote || '') + trailing + ')';
      });
    return result;
  }

  function buildComponentDocument(options) {
    options = options || {};
    var title = escapeHtml(options.title);
    var url = escapeHtml(options.url);
    var htmlAttrs = attrsToString(options.htmlAttrs);
    var bodyAttrs = attrsToString(options.bodyAttrs);
    var css = stringValue(options.css);
    var bodyHtml = stringValue(options.bodyHtml);
    return '<!DOCTYPE html>\n'
      + '<html' + htmlAttrs + '>\n'
      + '<head>\n'
      + '<meta charset="utf-8">\n'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + '<title>' + title + '</title>\n'
      + '<base href="' + url + '">\n'
      + '<style>' + css + '</style>\n'
      + '</head>\n'
      + '<body' + bodyAttrs + '>' + bodyHtml + '</body>\n'
      + '</html>';
  }

  function formatBytes(value) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    var amount = value / Math.pow(1024, index);
    if (index === 0) return Math.round(amount) + ' B';
    if (index === 1 || index === 2) return amount.toFixed(1) + ' ' + units[index];
    return Math.round(amount * 10) / 10 + ' ' + units[index];
  }

  function previewTitle(title, type) {
    var value = stringValue(title).trim() || 'Untitled';
    if (value.length > 80) value = value.slice(0, 79).trimEnd() + '…';
    var captureType = type === 'component' ? 'component' : 'page';
    return value + ' (' + captureType + ')';
  }

  var API = {
    absolutizeCssUrls: absolutizeCssUrls,
    computeScrollSteps: computeScrollSteps,
    isEventHandlerAttr: isEventHandlerAttr,
    buildFileName: buildFileName,
    escapeHtml: escapeHtml,
    attrsToString: attrsToString,
    findCssUrls: findCssUrls,
    replaceCssUrls: replaceCssUrls,
    buildComponentDocument: buildComponentDocument,
    formatBytes: formatBytes,
    previewTitle: previewTitle
  };

  if (root) root.WebCutCloneLogic = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null));
