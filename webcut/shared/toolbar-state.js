'use strict';

(function (root) {
  function createToolbarState() {
    var current = 'idle';
    var subscribers = new Set();

    function transition(allowedFrom, next) {
      if (allowedFrom.indexOf(current) === -1) return false;
      current = next;
      Array.from(subscribers).forEach(function (subscriber) {
        subscriber(current);
      });
      return true;
    }

    return {
      get: function () { return current; },
      startSelecting: function () { return transition(['idle'], 'selecting'); },
      startExport: function () { return transition(['idle', 'selecting'], 'exporting'); },
      cancel: function () { return transition(['selecting'], 'idle'); },
      finish: function () { return transition(['exporting'], 'idle'); },
      subscribe: function (subscriber) {
        if (typeof subscriber !== 'function') throw new TypeError('subscriber must be a function');
        subscribers.add(subscriber);
        var subscribed = true;
        return function unsubscribe() {
          if (!subscribed) return;
          subscribed = false;
          subscribers.delete(subscriber);
        };
      }
    };
  }

  var API = { createToolbarState: createToolbarState };
  if (root) root.WebCutToolbarState = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null));
