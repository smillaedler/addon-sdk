/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use strict';

const { Cc, Ci } = require('chrome');
const { isPrivate } = require('sdk/private-browsing');
const { isWindowPBSupported } = require('sdk/private-browsing/utils');
const { onFocus, getMostRecentWindow, getWindowTitle,
        getFrames, windows, open: openWindow, isWindowPrivate } = require('sdk/window/utils');
const { open, close, focus, promise } = require('sdk/window/helpers');
const { browserWindows } = require("sdk/windows");
const winUtils = require("sdk/deprecated/window-utils");
const { fromIterator: toArray } = require('sdk/util/array');

const WM = Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator);

const BROWSER = 'chrome://browser/content/browser.xul';

function makeEmptyBrowserWindow(options) {
  options = options || {};
  return open(BROWSER, {
    features: {
      chrome: true,
      private: !!options.private
    }
  });
}

exports.testWindowTrackerIgnoresPrivateWindows = function(assert, done) {
  var myNonPrivateWindow, myPrivateWindow;
  var finished = false;
  var privateWindow;
  var privateWindowClosed = false;
  var privateWindowOpened = false;

  let wt = winUtils.WindowTracker({
    onTrack: function(window) {
      if (window === myPrivateWindow) {
        assert.equal(isPrivate(window), isWindowPBSupported);
        privateWindowOpened = true;
      }
    },
    onUntrack: function(window) {
      if (window === myPrivateWindow && isWindowPBSupported) {
        privateWindowClosed = true;
      }

      if (window === myNonPrivateWindow) {
        assert.equal(privateWindowClosed, isWindowPBSupported);
        assert.ok(privateWindowOpened);
        wt.unload();
        done();
      }
    }
  });

  // make a new private window
  myPrivateWindow = openWindow(BROWSER, {
  	features: {
      private: true
    }
  });
  promise(myPrivateWindow, 'load').then(function(window) {
    assert.equal(isPrivate(window), isWindowPBSupported, 'private window isPrivate');
    assert.equal(isWindowPrivate(window), isWindowPBSupported);
    assert.ok(getFrames(window).length > 1, 'there are frames for private window');
    assert.equal(getWindowTitle(window), window.document.title,
                 'getWindowTitle works');

    close(myPrivateWindow).then(function() {
      assert.pass('private window was closed');
      makeEmptyBrowserWindow().then(function(window) {
        myNonPrivateWindow = window;
        assert.notDeepEqual(myPrivateWindow, myNonPrivateWindow);
        assert.pass('opened new window');
        close(myNonPrivateWindow).then(function() {
          assert.pass('non private window was closed');
        })
      });
    });
  });
};

// Test setting activeWIndow and onFocus for private windows
exports.testSettingActiveWindowIgnoresPrivateWindow = function(assert, done) {
  let browserWindow = WM.getMostRecentWindow("navigator:browser");
  let testSteps;

  assert.equal(winUtils.activeBrowserWindow, browserWindow,
               "Browser window is the active browser window.");

  // make a new private window
  makeEmptyBrowserWindow({
    private: true
  }).then(function(window) {
    let continueAfterFocus = function(window) onFocus(window).then(nextTest);

    // PWPB case
    if (isWindowPBSupported) {
      assert.ok(isPrivate(window), "window is private");
      assert.notDeepEqual(winUtils.activeBrowserWindow, browserWindow);
    }
    // Global case
    else {
      assert.ok(!isPrivate(window), "window is not private");
    }

    assert.deepEqual(winUtils.activeBrowserWindow, window,
                 "Correct active browser window pb supported");

    testSteps = [
      function() {
        continueAfterFocus(winUtils.activeWindow = browserWindow);
      },
      function() {
          assert.deepEqual(winUtils.activeWindow, window,
                           "Correct active window [1]");

        focus(window).then(nextTest);
      },
      function() {
        assert.deepEqual(winUtils.activeBrowserWindow, window,
                         "Correct active browser window [2]");
        assert.deepEqual(winUtils.activeWindow, window,
                         "Correct active window [2]");

        winUtils.activeWindow = window;
        onFocus(window).then(nextTest);
      },
      function() {
        assert.deepEqual(winUtils.activeBrowserWindow, window,
                         "Correct active browser window [3]");
        assert.deepEqual(winUtils.activeWindow, window,
                         "Correct active window [3]");

        continueAfterFocus(winUtils.activeWindow = browserWindow);
      },
      function() {
        assert.deepEqual(winUtils.activeBrowserWindow, browserWindow,
                         "Correct active browser window when pb mode is supported [4]");
        assert.deepEqual(winUtils.activeWindow, browserWindow,
                         "Correct active window when pb mode is supported [4]");
        close(window).then(done);
      }
    ];
    function nextTest() {
      if (testSteps.length)
        testSteps.shift()();
    }
    nextTest();
  });
};

exports.testActiveWindowIgnoresPrivateWindow = function(assert, done) {
  // make a new private window
  makeEmptyBrowserWindow({
    private: true
  }).then(function(window) {
    // PWPB case
    if (isWindowPBSupported) {
      assert.equal(isPrivate(winUtils.activeWindow), true,
                   "active window is private");
      assert.equal(isPrivate(winUtils.activeBrowserWindow), true,
                   "active browser window is private");
      assert.ok(isWindowPrivate(window), "window is private");
      assert.ok(isPrivate(window), "window is private");

      // pb mode is supported
      assert.ok(
        isWindowPrivate(winUtils.activeWindow),
        "active window is private when pb mode is supported");
      assert.ok(
        isWindowPrivate(winUtils.activeBrowserWindow),
        "active browser window is private when pb mode is supported");
      assert.ok(isPrivate(winUtils.activeWindow),
                "active window is private when pb mode is supported");
      assert.ok(isPrivate(winUtils.activeBrowserWindow),
        "active browser window is private when pb mode is supported");
    }
    // Global case
    else {
      assert.equal(isPrivate(winUtils.activeWindow), false,
                   "active window is not private");
      assert.equal(isPrivate(winUtils.activeBrowserWindow), false,
                   "active browser window is not private");
      assert.equal(isWindowPrivate(window), false, "window is not private");
      assert.equal(isPrivate(window), false, "window is not private");
    }

    close(window).then(done);
  });
}

exports.testWindowIteratorIgnoresPrivateWindows = function(assert, done) {
  // make a new private window
  makeEmptyBrowserWindow({
    private: true
  }).then(function(window) {
    assert.equal(isWindowPrivate(window), isWindowPBSupported);
    assert.ok(toArray(winUtils.windowIterator()).indexOf(window) > -1,
              "window is in windowIterator()");

    close(window).then(done);
  });
};

// test that it is not possible to find a private window in
// windows module's iterator
exports.testWindowIteratorPrivateDefault = function(assert, done) {
  assert.equal(browserWindows.length, 1, 'only one window open');

  open('chrome://browser/content/browser.xul', {
    features: {
      private: true,
      chrome: true
    }
  }).then(function(window) {
    // test that there is a private window opened
    assert.equal(isPrivate(window), isWindowPBSupported, 'there is a private window open');
    assert.equal(isPrivate(winUtils.activeWindow), isWindowPBSupported);
    assert.equal(isPrivate(getMostRecentWindow()), isWindowPBSupported);
    assert.equal(isPrivate(browserWindows.activeWindow), isWindowPBSupported);

    assert.equal(browserWindows.length, 2, '2 windows open');
    assert.equal(windows(null, { includePrivate: true }).length, 2);

    close(window).then(done);
  });
};