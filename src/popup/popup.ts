interface ExtensionState {
  enabled: boolean;
  maxNestingLevel: number;
  showReactTree: boolean;
}

class PopupController {
  private state: ExtensionState = {
    enabled: false,
    maxNestingLevel: 3,
    showReactTree: true,
  };

  private enableToggle: HTMLInputElement;
  private nestingLevel: HTMLInputElement;
  private nestingValue: HTMLElement;
  private reactTreeRadio: HTMLInputElement;
  private domTreeRadio: HTMLInputElement;
  private statusEl: HTMLElement;

  // A11y Bridge elements
  private vsCodeStatusEl: HTMLElement;
  private a11ySelectorEl: HTMLTextAreaElement;
  private a11yViolationEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private traceStatusEl: HTMLElement;

  constructor() {
    this.enableToggle = document.getElementById('enableToggle') as HTMLInputElement;
    this.nestingLevel = document.getElementById('nestingLevel') as HTMLInputElement;
    this.nestingValue = document.getElementById('nestingValue') as HTMLElement;
    this.reactTreeRadio = document.querySelector('input[value="react"]') as HTMLInputElement;
    this.domTreeRadio = document.querySelector('input[value="dom"]') as HTMLInputElement;
    this.statusEl = document.getElementById('status') as HTMLElement;

    this.vsCodeStatusEl = document.getElementById('vsCodeStatus') as HTMLElement;
    this.a11ySelectorEl = document.getElementById('a11ySelector') as HTMLTextAreaElement;
    this.a11yViolationEl = document.getElementById('a11yViolation') as HTMLInputElement;
    this.sendBtn = document.getElementById('sendToVSCode') as HTMLButtonElement;
    this.traceStatusEl = document.getElementById('traceStatus') as HTMLElement;

    this.init();
  }

  private async init() {
    await this.loadState();
    this.setupEventListeners();
    this.updateUI();
    this.checkReactStatus();
    this.checkVSCodeConnection();
    this.listenForVSCodeStatus();
  }

  private async loadState() {
    return new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
        if (response) {
          this.state = response;
        }
        resolve();
      });
    });
  }

  private setupEventListeners() {
    this.enableToggle.addEventListener('change', () => {
      this.state.enabled = this.enableToggle.checked;
      this.saveState();
    });

    this.nestingLevel.addEventListener('input', () => {
      const value = parseInt(this.nestingLevel.value, 10);
      this.state.maxNestingLevel = value;
      this.nestingValue.textContent = value.toString();
    });

    this.nestingLevel.addEventListener('change', () => {
      this.saveState();
    });

    this.reactTreeRadio.addEventListener('change', () => {
      if (this.reactTreeRadio.checked) {
        this.state.showReactTree = true;
        this.saveState();
      }
    });

    this.domTreeRadio.addEventListener('change', () => {
      if (this.domTreeRadio.checked) {
        this.state.showReactTree = false;
        this.saveState();
      }
    });

    // A11y Bridge: send button
    this.sendBtn.addEventListener('click', () => {
      const selector = this.a11ySelectorEl.value.trim();
      if (!selector) return;

      this.traceStatusEl.textContent = 'Tracing...';
      this.traceStatusEl.className = 'trace-status pending';
      this.sendBtn.disabled = true;

      chrome.runtime.sendMessage(
        {
          type: 'SEND_TO_VSCODE',
          violation: {
            selector,
            violationDescription: this.a11yViolationEl.value.trim(),
          },
        },
        () => {
          this.sendBtn.disabled = false;
          this.traceStatusEl.textContent = 'Sent to VS Code';
          this.traceStatusEl.className = 'trace-status success';
        }
      );
    });

    // Enable send button only when selector is non-empty
    this.a11ySelectorEl.addEventListener('input', () => {
      this.updateSendButton();
    });
  }

  private updateSendButton() {
    const hasSelector = this.a11ySelectorEl.value.trim().length > 0;
    // Check connection status from badge class
    const isConnected = this.vsCodeStatusEl.classList.contains('connected');
    this.sendBtn.disabled = !(hasSelector && isConnected);
  }

  private checkVSCodeConnection() {
    chrome.runtime.sendMessage({ type: 'CHECK_VSCODE_CONNECTION' }, (response) => {
      this.setVSCodeStatus(response?.connected ?? false);
    });
  }

  private listenForVSCodeStatus() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'VSCODE_CONNECTED') {
        this.setVSCodeStatus(message.connected);
      }
    });
  }

  private setVSCodeStatus(connected: boolean) {
    if (connected) {
      this.vsCodeStatusEl.textContent = 'VS Code: Connected';
      this.vsCodeStatusEl.className = 'vscode-badge connected';
    } else {
      this.vsCodeStatusEl.textContent = 'VS Code: Not connected';
      this.vsCodeStatusEl.className = 'vscode-badge disconnected';
    }
    this.updateSendButton();
  }

  private updateUI() {
    this.enableToggle.checked = this.state.enabled;
    this.nestingLevel.value = this.state.maxNestingLevel.toString();
    this.nestingValue.textContent = this.state.maxNestingLevel.toString();

    if (this.state.showReactTree) {
      this.reactTreeRadio.checked = true;
    } else {
      this.domTreeRadio.checked = true;
    }
  }

  private async saveState() {
    chrome.runtime.sendMessage({
      type: 'SET_STATE',
      state: this.state,
    });
  }

  private async checkReactStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab?.id) {
        // Try to detect React on the page
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            func: () => {
              const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
              if (hook && (hook.renderers?.size > 0 || hook.supportsFiber)) {
                return 'detected';
              }
              // Check for React fiber on DOM elements
              const elements = document.querySelectorAll('*');
              for (const el of elements) {
                const keys = Object.keys(el);
                if (keys.some(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'))) {
                  return 'detected';
                }
              }
              return 'not-detected';
            },
          },
          (results) => {
            if (chrome.runtime.lastError) {
              this.setStatus('not-detected', 'No access');
              return;
            }

            const result = results?.[0]?.result;
            if (result === 'detected') {
              this.setStatus('detected', 'React detected');
            } else {
              this.setStatus('not-detected', 'No React found');
            }
          }
        );
      }
    } catch {
      this.setStatus('not-detected', 'Error');
    }
  }

  private setStatus(className: string, text: string) {
    this.statusEl.className = `status ${className}`;
    this.statusEl.textContent = text;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});

export {};
