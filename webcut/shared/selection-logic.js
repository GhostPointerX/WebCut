'use strict';

(function (root) {
  function valueOf(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value.baseVal === 'string') return value.baseVal;
    return String(value);
  }

  function describeElement(info) {
    info = info || {};
    var tag = valueOf(info.tagName).trim().toLowerCase();
    var id = valueOf(info.id).trim();
    var className = valueOf(info.className).trim();
    var firstClass = className.split(/\s+/).filter(Boolean)[0] || '';
    var label = id ? tag + '#' + id : firstClass ? tag + '.' + firstClass : tag;
    return label + ' ' + Math.round(info.width) + 'x' + Math.round(info.height);
  }

  function tagName(el) {
    return valueOf(el && el.tagName).trim().toLowerCase();
  }

  function isSelectable(el, hostEl) {
    if (!el || typeof el !== 'object' || !el.tagName) return false;
    var tag = tagName(el);
    if (['html', 'webcut-ui-root', 'script', 'style', 'link', 'meta', 'head', 'title', 'noscript', 'template', 'base'].indexOf(tag) !== -1) return false;
    if (el === hostEl) return false;
    if (hostEl && typeof hostEl.contains === 'function' && hostEl.contains(el)) return false;
    return true;
  }

  function pickTarget(elementsAtPoint, hostEl) {
    if (!elementsAtPoint || typeof elementsAtPoint.length !== 'number') return null;
    for (var i = 0; i < elementsAtPoint.length; i += 1) {
      if (isSelectable(elementsAtPoint[i], hostEl)) return elementsAtPoint[i];
    }
    return null;
  }

  function pickParent(el) {
    var parent = el && el.parentElement;
    return isSelectable(parent, null) ? parent : null;
  }

  function pickChild(el) {
    var children = el && el.children;
    if (!children || typeof children.length !== 'number') return null;
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (!isSelectable(child, null) || typeof child.getBoundingClientRect !== 'function') continue;
      var rect = child.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return child;
    }
    return null;
  }

  function createSelectionNav() {
    var current = null;
    var history = [];

    function set(value) {
      current = value || null;
      history = [];
      return current;
    }

    function up() {
      if (!current) return current;
      var parent = pickParent(current);
      if (!parent) return current;
      history.push(current);
      current = parent;
      return current;
    }

    function down() {
      if (!current) return current;
      var remembered = history.length ? history.pop() : null;
      var child = remembered && typeof current.contains === 'function' && current.contains(remembered)
        ? remembered
        : pickChild(current);
      if (!child) return current;
      current = child;
      return current;
    }

    function reset() {
      current = null;
      history = [];
      return current;
    }

    return {
      current: function () { return current; },
      set: set,
      up: up,
      down: down,
      reset: reset
    };
  }

  var API = {
    describeElement: describeElement,
    isSelectable: isSelectable,
    pickTarget: pickTarget,
    pickParent: pickParent,
    pickChild: pickChild,
    createSelectionNav: createSelectionNav
  };

  if (root) root.WebCutSelectionLogic = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null));
