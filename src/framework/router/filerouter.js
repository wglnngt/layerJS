'use strict';
var Kern = require('../../kern/Kern.js');
var parseManager = require("../parsemanager.js");
var state = require("../state.js");
var $ = require('../domhelpers.js');
var defaults = require('../defaults.js');

var FileRouter = Kern.EventManager.extend({
  constructor: function(options) {
    options = options || {};

    this._cache = {};

    if (options.cacheCurrent) {
      var url = window.location.href.split('#')[0].replace(window.location.origin,'');
      this._cache[url] = state.exportState();
    }
  },
  /**
   * Will do the actual navigation to the url
   * @param {UrlData} an url
   * @return {boolean} True if the router handled the url
   */
  handle: function(urlData) {
    var that = this;
    var promise = new Kern.Promise();
    var canHandle = true;

    if (urlData.url.match(/^\w+:/)) { // absolute URL
      if (!urlData.url.match(new RegExp('^' + window.location.origin))) {
        canHandle = false;
        promise.resolve({
          handled: false,
          stop: false
        });
      }
    }

    var splitted = urlData.url.split('#');
    if (canHandle && window.location.href.indexOf(urlData.pathname) !== -1 && splitted.length > 1) {
      // same file and with a hash
      canHandle = false;
      promise.resolve({
        handled: false,
        stop: false
      });
    }

    if (canHandle && this._cache.hasOwnProperty(urlData.pathname)) {
      canHandle = false;
      var framesToTransitionTo = this._cache[urlData.pathname];
      state.transitionTo(framesToTransitionTo, urlData.transition);
      promise.resolve({
        stop: false,
        handled: true
      });
    }

    if (canHandle) {
      this._loadHTML(urlData.url).then(function(doc) {
        parseManager.parseDocument(doc);
        var loadedFrames = state.exportStructure(doc);
        var toParseChildren = {};
        var alreadyImported = {};

        for (var x = 0; x < loadedFrames.length; x++) {
          var orginalView = state.getViewForPath(loadedFrames[x], document);
          if (undefined !== orginalView || loadedFrames[x].endsWith('.' + defaults.specialFrames.none)) {
            // already imported or null frame
            continue;
          }

          var parentView;
          var parentPath = loadedFrames[x];
          var pathToImport;

          while (undefined === parentView && parentPath.indexOf('.') > 0 && !alreadyImported.hasOwnProperty(parentPath)) {
            pathToImport = parentPath;
            parentPath = pathToImport.replace(/\.[^\.]*$/, "");
            parentView = state.getViewForPath(parentPath, document);
            // find parent in existing document or check if it has just been added
          }

          if (undefined !== parentView && !alreadyImported.hasOwnProperty[parentPath]) {
            // parent found and not yet imported, add it's child (pathToImport) to it
            var stateToImport = state.getStateForPath(pathToImport, doc);
            stateToImport.view.outerEl.style.opacity = 0;
            parentView.innerEl.insertAdjacentHTML('beforeend', stateToImport.view.outerEl.outerHTML);
            toParseChildren[parentPath] = true;
            alreadyImported[pathToImport] = true;
          }
        }

        var framesToTransitionTo = state.exportState(doc);
        that._cache[urlData.url] = framesToTransitionTo;

        if (framesToTransitionTo.length > 0) {
          $.postAnimationFrame(function() {
            state.transitionTo(framesToTransitionTo, urlData.transition);
            promise.resolve({
              stop: false,
              handled: true
            });
          });
        } else {
          promise.resolve({
            stop: false,
            handled: true
          });
        }
      }, function() {
        promise.resolve({
          stop: false,
          handled: false
        });
      });
    }

    return promise;
  },
  /**
   * load an HTML document by AJAX and return it through a promise
   *
   * @param {string} URL - the url of the HMTL document
   * @returns {Promise} a promise that will return the HTML document
   */
  _loadHTML: function(URL) {
    var p = new Kern.Promise();

    try {
      var xhr = new XMLHttpRequest();
      xhr.onerror = function() {
        p.reject();
      };
      xhr.onload = function() {
        var doc = document.implementation.createHTMLDocument("framedoc");
        doc.documentElement.innerHTML = xhr.responseText;

        p.resolve(doc);
      };
      xhr.open("GET", URL);
      xhr.responseType = "text";
      xhr.send();
    } catch (e) {
      p.reject(e);
    }

    return p;
  }
});

module.exports = FileRouter;
