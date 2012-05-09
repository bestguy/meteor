Meteor.ui = Meteor.ui || {};

(function() {

  // for IE 6-8
  if (! document.addEventListener) {
    Meteor.ui._loadNoW3CEvents();
    return;
  }

  var SIMULATE_FOCUS_BLUR = 1;
  var SIMULATE_FOCUSIN_FOCUSOUT = 2;

  // If we have focusin/focusout, use them to simulate focus/blur.
  // This has the nice effect of making focus/blur synchronous in IE 9+.
  // It doesn't work in Firefox, which lacks focusin/focusout completely
  // as of v11.0.  This style of event support testing ('onfoo' in div)
  // doesn't work in Firefox 3.6, but does in IE and WebKit.
  var focusBlurMode = ('onfocusin' in document.createElement("DIV")) ?
        SIMULATE_FOCUS_BLUR : SIMULATE_FOCUSIN_FOCUSOUT;

  var prefix = '_liveevents_';

  var universalCapturer = function(event) {
    var type = event.type;
    var bubbles = event.bubbles;
    var target = event.target;

    target.addEventListener(type, universalHandler, false);

    // according to the DOM event spec, ancestors for bubbling
    // purposes are determined at dispatch time (and ignore changes
    // to the DOM after that)
    var ancestors;
    if (bubbles) {
      ancestors = [];
      for(var n = target.parentNode; n; n = n.parentNode) {
        n.addEventListener(type, universalHandler, false);
        ancestors.push(n);
      };
    }

    Meteor.defer(function() {
      target.removeEventListener(type, universalHandler);
      if (bubbles) {
        _.each(ancestors, function(n) {
          n.removeEventListener(type, universalHandler);
        });
      };
    });
  };

  var sendUIEvent = function(type, target, bubbles, cancelable, detail) {
    var event = document.createEvent("UIEvents");
    event.initUIEvent(type, bubbles, cancelable, window, detail);
    event.synthetic = true;
    target.dispatchEvent(event);
  };

  var doHandleHacks = function(event) {
    // fire synthetic focusin/focusout on blur/focus or vice versa
    if (event.currentTarget === event.target) {
      if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
        if (event.type === 'focusin')
          sendUIEvent('focus', event.target, false);
        else if (event.type === 'focusout')
          sendUIEvent('blur', event.target, false);
      } else { // SIMULATE_FOCUSIN_FOCUSOUT
        if (event.type === 'focus')
          sendUIEvent('focusin', event.target, true);
        else if (event.type === 'blur')
          sendUIEvent('focusout', event.target, true);
      }
    }
    // only respond to synthetic events of the types we are faking
    if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
      if (event.type === 'focus' || event.type === 'blur') {
        if (! event.synthetic)
          return false;
      }
    } else { // SIMULATE_FOCUSIN_FOCUSOUT
      if (event.type === 'focusin' || event.type === 'focusout') {
        if (! event.synthetic)
          return false;
      }
    }

    return true;
  };

  var doInstallHacks = function(node, eventType) {
    // install handlers for the events used to fake events of this type,
    // in addition to handlers for the real type
    if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
      if (eventType === 'focus')
        Meteor.ui._installLiveHandler(node, 'focusin');
      else if (eventType === 'blur')
        Meteor.ui._installLiveHandler(node, 'focusout');
    } else { // SIMULATE_FOCUSIN_FOCUSOUT
      if (eventType === 'focusin')
        Meteor.ui._installLiveHandler(node, 'focus');
      else if (eventType === 'focusout')
        Meteor.ui._installLiveHandler(node, 'blur');
    }
  };

  var universalHandler = function(event) {
    if (doHandleHacks(event) === false)
      return;

    var curNode = event.currentTarget;
    if (! curNode)
      return;

    var innerRange = Meteor.ui._LiveRange.findRange(Meteor.ui._tag, curNode);
    if (! innerRange)
      return;

    var isPropagationStopped = false;

    var originalStopPropagation = event.stopPropagation;
    var originalPreventDefault = event.preventDefault;
    event.stopPropagation = function() {
      isPropagationStopped = true;
      originalStopPropagation.call(event);
    };
    event.preventDefault = function() {
      originalPreventDefault.call(event);
    };

    var type = event.type;

    for(var range = innerRange; range; range = range.findParent(true)) {
      if (! range.event_handlers)
        continue;

      _.each(range.event_handlers, function(h) {
        if (h.type !== type)
          return;

        var selector = h.selector;
        if (selector) {
          var contextNode = range.containerNode();
          var results = $(contextNode).find(selector);
          if (! _.contains(results, curNode))
            return;
        }

        var returnValue = h.callback.call(range.event_data, event);
        if (returnValue === false) {
          // extension due to jQuery
          event.stopPropagation();
          event.preventDefault();
        }
      });

      if (isPropagationStopped)
        break;
    }
  };

  Meteor.ui._installLiveHandler = function(node, eventType) {
    doInstallHacks(node, eventType);

    var propName = prefix + eventType;
    if (! document[propName]) {
      // only bind one event capturer per type
      document[propName] = true;
      document.addEventListener(eventType, universalCapturer, true);
    }

  };

  Meteor.ui._resetEvents = function(node) {
    // no action needed, listeners are on document.
  };
})();