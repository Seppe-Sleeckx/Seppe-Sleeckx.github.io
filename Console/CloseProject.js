function closeOverlay() {
    // Tell the parent window to close the overlay
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: 'closeOverlay' }, '*');
    }
  }