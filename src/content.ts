// Content script that bridges between the extension and the injected script

interface ExtensionState {
  enabled: boolean;
  maxNestingLevel: number;
  showReactTree: boolean;
}

// Inject the main script into the page context
function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Inject as early as possible
injectScript();

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'STATE_CHANGED') {
    // Forward state to the injected script via custom event
    window.postMessage(
      {
        source: 'react-component-highlighter-extension',
        type: 'STATE_CHANGED',
        state: message.state,
      },
      '*'
    );
    sendResponse({ success: true });
  }

  if (message.type === 'TRACE_SELECTOR') {
    // Forward trace request to injected script
    window.postMessage(
      {
        source: 'react-component-highlighter-extension',
        type: 'TRACE_SELECTOR',
        violation: message.violation,
      },
      '*'
    );
    sendResponse({ success: true });
  }

  return true;
});

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'react-component-highlighter-page') return;

  const { type, data } = event.data;

  if (type === 'REQUEST_STATE') {
    // Get current state from background and forward to page
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state: ExtensionState) => {
      window.postMessage(
        {
          source: 'react-component-highlighter-extension',
          type: 'STATE_CHANGED',
          state,
        },
        '*'
      );
    });
  }

  if (type === 'REACT_DETECTED') {
    console.log('[React Highlighter] React detected:', data);
  }

  if (type === 'TRACE_RESULT') {
    // Forward trace result back to background script
    chrome.runtime.sendMessage({
      type: 'TRACE_RESULT',
      payload: event.data.payload,
    });
  }
});

// Request initial state
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state: ExtensionState) => {
  if (state) {
    window.postMessage(
      {
        source: 'react-component-highlighter-extension',
        type: 'STATE_CHANGED',
        state,
      },
      '*'
    );
  }
});

export {};
