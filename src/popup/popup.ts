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

  constructor() {
    this.enableToggle = document.getElementById('enableToggle') as HTMLInputElement;
    this.nestingLevel = document.getElementById('nestingLevel') as HTMLInputElement;
    this.nestingValue = document.getElementById('nestingValue') as HTMLElement;
    this.reactTreeRadio = document.querySelector('input[value="react"]') as HTMLInputElement;
    this.domTreeRadio = document.querySelector('input[value="dom"]') as HTMLInputElement;
    this.statusEl = document.getElementById('status') as HTMLElement;

    this.init();
  }

  private async init() {
    await this.loadState();
    this.setupEventListeners();
    this.updateUI();
    this.checkReactStatus();
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
