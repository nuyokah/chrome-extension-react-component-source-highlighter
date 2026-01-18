// Background service worker for React Component Source Highlighter

interface ExtensionState {
  enabled: boolean;
  maxNestingLevel: number;
  showReactTree: boolean; // true = React tree, false = DOM tree
}

const defaultState: ExtensionState = {
  enabled: false,
  maxNestingLevel: 3,
  showReactTree: true,
};

// Initialize state on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ state: defaultState });
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    chrome.storage.local.get('state', (result) => {
      sendResponse(result.state || defaultState);
    });
    return true; // Required for async sendResponse
  }

  if (message.type === 'SET_STATE') {
    chrome.storage.local.set({ state: message.state }, () => {
      // Broadcast state change to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'STATE_CHANGED',
              state: message.state,
            }).catch(() => {
              // Tab might not have content script loaded
            });
          }
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'TOGGLE_ENABLED') {
    chrome.storage.local.get('state', (result) => {
      const currentState = result.state || defaultState;
      const newState = { ...currentState, enabled: !currentState.enabled };
      chrome.storage.local.set({ state: newState }, () => {
        // Send to the specific tab that made the request
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'STATE_CHANGED',
            state: newState,
          }).catch(() => {});
        }
        sendResponse(newState);
      });
    });
    return true;
  }
});

// Handle keyboard shortcut (if configured)
chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'toggle-highlighter') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED' });
      }
    });
  }
});

export {};
