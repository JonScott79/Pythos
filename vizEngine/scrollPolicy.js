/**
 * scrollPolicy.js
 *
 * Pythos Chat Viewport & Scroll Policy Manager.
 * Exportable and testable in both Browser and Node.js environments.
 *
 * Core Rules:
 * 1. New assistant response:
 *    Position viewport at the TOP of the assistant response (`scrollToMessageTop`).
 * 2. User following response during streaming:
 *    Allow smooth automatic scrolling during token streaming only if the user has NOT scrolled away.
 * 3. User scrolls away from response (upward):
 *    Stop automatic scrolling immediately and NEVER yank the student back down.
 * 4. DOM changes (KaTeX rendering, visualization insertion, tables, error banners):
 *    Preserve the assistant message's top or the user's current reading position.
 * 5. Response completion / draft promotion:
 *    Do NOT force-scroll to the bottom. Keep viewport aligned with the assistant response's top
 *    or the student's current reading position.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosScrollPolicy = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  function createScrollManager(options = {}) {
    const threshold = options.threshold || 60;
    const scrollTolerance = options.scrollTolerance || 80;
    let isUserScrolledUp = false;
    let isProgrammaticScroll = false;
    let scrollResetTimeout = null;

    function isNearBottom(container, customThreshold) {
      if (!container) return true;
      const t = typeof customThreshold === 'number' ? customThreshold : threshold;
      return (container.scrollHeight - container.clientHeight - container.scrollTop) <= t;
    }

    function handleScrollEvent(container) {
      if (!container || isProgrammaticScroll) return;
      isUserScrolledUp = !isNearBottom(container, threshold);
    }

    function scrollToMessageTop(container, element, smooth = false) {
      if (!container || !element) return;
      isProgrammaticScroll = true;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);

      const targetTop = Math.max(0, (element.offsetTop || 0) - 12);
      if (smooth && typeof container.scrollTo === 'function') {
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        container.scrollTop = targetTop;
      }

      scrollResetTimeout = setTimeout(() => {
        isProgrammaticScroll = false;
      }, 400);

      return targetTop;
    }

    function clearProgrammaticScroll() {
      isProgrammaticScroll = false;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);
    }

    function scrollToChatBottom(container, smooth = false) {
      if (!container) return;
      isProgrammaticScroll = true;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);

      const targetTop = container.scrollHeight;
      if (smooth && typeof container.scrollTo === 'function') {
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        container.scrollTop = targetTop;
      }

      scrollResetTimeout = setTimeout(() => {
        isProgrammaticScroll = false;
      }, 400);

      return targetTop;
    }

    function onNewMessage(container, messageEl, role) {
      if (role === 'user') {
        isUserScrolledUp = false;
        return scrollToChatBottom(container, false);
      } else if (role === 'assistant') {
        if (!isUserScrolledUp) {
          return scrollToMessageTop(container, messageEl, false);
        }
      }
      return null;
    }

    function onStreamingToken(container) {
      // Only auto-scroll if user has NOT scrolled upward and is near bottom
      if (!isUserScrolledUp && isNearBottom(container, scrollTolerance)) {
        return scrollToChatBottom(container, false);
      }
      return null;
    }

    function setUserScrolledUp(val) {
      isUserScrolledUp = Boolean(val);
    }

    function getUserScrolledUp() {
      return isUserScrolledUp;
    }

    function reset() {
      isUserScrolledUp = false;
      isProgrammaticScroll = false;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);
    }

    return {
      isNearBottom,
      handleScrollEvent,
      scrollToMessageTop,
      scrollToChatBottom,
      onNewMessage,
      onStreamingToken,
      setUserScrolledUp,
      getUserScrolledUp,
      clearProgrammaticScroll,
      reset
    };
  }

  return {
    createScrollManager
  };
}));
