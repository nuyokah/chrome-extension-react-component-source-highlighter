// Injected script that runs in the page context and hooks into React

interface ExtensionState {
  enabled: boolean;
  maxNestingLevel: number;
  showReactTree: boolean;
}

interface ComponentInfo {
  id: string;
  name: string;
  source: string | null;
  fileName: string | null;
  lineNumber: number | null;
  element: Element;
  depth: number;
  rect: DOMRect;
}

interface FiberNode {
  tag: number;
  key: string | null;
  elementType: any;
  type: any;
  stateNode: any;
  return: FiberNode | null;
  child: FiberNode | null;
  sibling: FiberNode | null;
  index: number;
  memoizedProps: any;
  memoizedState: any;
  _debugSource?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
  _debugOwner?: FiberNode;
  alternate: FiberNode | null;
}

// React Fiber tag types
const FiberTags = {
  FunctionComponent: 0,
  ClassComponent: 1,
  IndeterminateComponent: 2,
  HostRoot: 3,
  HostPortal: 4,
  HostComponent: 5,
  HostText: 6,
  Fragment: 7,
  Mode: 8,
  ContextConsumer: 9,
  ContextProvider: 10,
  ForwardRef: 11,
  Profiler: 12,
  SuspenseComponent: 13,
  MemoComponent: 14,
  SimpleMemoComponent: 15,
  LazyComponent: 16,
  IncompleteClassComponent: 17,
  DehydratedFragment: 18,
  SuspenseListComponent: 19,
  ScopeComponent: 21,
  OffscreenComponent: 22,
  LegacyHiddenComponent: 23,
  CacheComponent: 24,
  TracingMarkerComponent: 25,
};

class ReactComponentHighlighter {
  private state: ExtensionState = {
    enabled: false,
    maxNestingLevel: 3,
    showReactTree: true,
  };
  private overlayContainer: HTMLDivElement | null = null;
  private reactRoots: Set<Element> = new Set();
  private renderers: Map<number, any> = new Map();
  private isReactDetected = false;
  private hoveredElement: Element | null = null;
  private componentCache: Map<Element, ComponentInfo[]> = new Map();

  constructor() {
    this.setupHook();
    this.setupMessageListener();
    this.setupMouseListeners();
    this.createOverlayContainer();
  }

  private setupHook() {
    // Install the React DevTools global hook if not already present
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;

    if (!hook) {
      // Create our own minimal hook to detect React
      (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        renderers: new Map(),
        supportsFiber: true,
        inject: (renderer: any) => {
          const id = this.renderers.size + 1;
          this.renderers.set(id, renderer);
          this.isReactDetected = true;
          this.notifyReactDetected();
          return id;
        },
        onCommitFiberRoot: (rendererID: number, root: any) => {
          this.handleFiberRoot(root);
        },
        onCommitFiberUnmount: () => {},
        onPostCommitFiberRoot: () => {},
        onScheduleFiberRoot: () => {},
      };
    } else {
      // Hook already exists (React DevTools installed), piggyback on it
      this.isReactDetected = hook.renderers?.size > 0;

      const originalOnCommitFiberRoot = hook.onCommitFiberRoot;
      hook.onCommitFiberRoot = (rendererID: number, root: any, ...args: any[]) => {
        this.handleFiberRoot(root);
        if (originalOnCommitFiberRoot) {
          originalOnCommitFiberRoot(rendererID, root, ...args);
        }
      };

      // Copy existing renderers
      if (hook.renderers) {
        hook.renderers.forEach((renderer: any, id: number) => {
          this.renderers.set(id, renderer);
        });
      }

      if (this.isReactDetected) {
        this.notifyReactDetected();
      }
    }
  }

  private handleFiberRoot(root: any) {
    if (!root?.current) return;

    // Find the container element
    const containerInfo = root.containerInfo;
    if (containerInfo instanceof Element) {
      this.reactRoots.add(containerInfo);
      this.isReactDetected = true;
      this.componentCache.clear(); // Clear cache on updates
    }
  }

  private notifyReactDetected() {
    window.postMessage(
      {
        source: 'react-component-highlighter-page',
        type: 'REACT_DETECTED',
        data: { rendererCount: this.renderers.size },
      },
      '*'
    );
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== 'react-component-highlighter-extension') return;

      const { type, state } = event.data;

      if (type === 'STATE_CHANGED' && state) {
        const wasEnabled = this.state.enabled;
        this.state = state;

        if (state.enabled && !wasEnabled) {
          this.showAllHighlights();
        } else if (!state.enabled && wasEnabled) {
          this.hideAllHighlights();
        } else if (state.enabled) {
          // Settings changed, refresh highlights
          this.refreshHighlights();
        }
      }
    });

    // Request initial state
    window.postMessage(
      {
        source: 'react-component-highlighter-page',
        type: 'REQUEST_STATE',
      },
      '*'
    );
  }

  private setupMouseListeners() {
    document.addEventListener('mousemove', (e) => {
      if (!this.state.enabled) return;

      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (element && element !== this.hoveredElement) {
        this.hoveredElement = element;
        this.highlightComponentsAtElement(element);
      }
    });

    document.addEventListener('mouseleave', () => {
      if (!this.state.enabled) return;
      this.hoveredElement = null;
      this.clearHighlights();
    });
  }

  private createOverlayContainer() {
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'react-component-highlighter-overlay';
    this.overlayContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
    `;
    document.documentElement.appendChild(this.overlayContainer);
  }

  private getFiberFromElement(element: Element): FiberNode | null {
    // React stores fiber on DOM nodes with keys like __reactFiber$...
    const keys = Object.keys(element);

    for (const key of keys) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        return (element as any)[key];
      }
    }

    return null;
  }

  private getComponentName(fiber: FiberNode): string {
    const { type, tag } = fiber;

    if (!type) {
      return 'Unknown';
    }

    // Function or class component
    if (typeof type === 'function') {
      return type.displayName || type.name || 'Anonymous';
    }

    // String type (DOM element)
    if (typeof type === 'string') {
      return type;
    }

    // ForwardRef
    if (tag === FiberTags.ForwardRef) {
      const innerType = type.render || type;
      if (typeof innerType === 'function') {
        return `ForwardRef(${innerType.displayName || innerType.name || 'Anonymous'})`;
      }
      return 'ForwardRef';
    }

    // Memo
    if (tag === FiberTags.MemoComponent || tag === FiberTags.SimpleMemoComponent) {
      const innerType = type.type || type;
      if (typeof innerType === 'function') {
        return `Memo(${innerType.displayName || innerType.name || 'Anonymous'})`;
      }
      return 'Memo';
    }

    // Context
    if (tag === FiberTags.ContextProvider) {
      return `${type._context?.displayName || 'Context'}.Provider`;
    }

    if (tag === FiberTags.ContextConsumer) {
      return `${type._context?.displayName || 'Context'}.Consumer`;
    }

    // Fragment
    if (tag === FiberTags.Fragment) {
      return 'Fragment';
    }

    // Suspense
    if (tag === FiberTags.SuspenseComponent) {
      return 'Suspense';
    }

    // Profiler
    if (tag === FiberTags.Profiler) {
      return `Profiler`;
    }

    return 'Unknown';
  }

  private sourceCache: Map<any, { fileName: string | null; lineNumber: number | null; source: string | null }> = new Map();

  private getSourceInfo(fiber: FiberNode): { fileName: string | null; lineNumber: number | null; source: string | null } {
    // Check _debugSource first (available in development mode with older JSX transform)
    if (fiber._debugSource) {
      const { fileName, lineNumber } = fiber._debugSource;
      const shortFileName = fileName?.split('/').pop() || fileName;
      return {
        fileName: shortFileName || null,
        lineNumber: lineNumber || null,
        source: fileName || null,
      };
    }

    // Try to get source from the type itself
    if (fiber.type && typeof fiber.type === 'function') {
      // Check cache first
      if (this.sourceCache.has(fiber.type)) {
        return this.sourceCache.get(fiber.type)!;
      }

      // Some bundlers add __source to the function
      const source = (fiber.type as any).__source;
      if (source) {
        const result = {
          fileName: source.fileName?.split('/').pop() || null,
          lineNumber: source.lineNumber || null,
          source: source.fileName || null,
        };
        this.sourceCache.set(fiber.type, result);
        return result;
      }

      // Use stack trace parsing (similar to React DevTools approach)
      const sourceFromStack = this.getSourceFromStackTrace(fiber.type);
      if (sourceFromStack) {
        this.sourceCache.set(fiber.type, sourceFromStack);
        return sourceFromStack;
      }

      // Cache the null result too
      const nullResult = { fileName: null, lineNumber: null, source: null };
      this.sourceCache.set(fiber.type, nullResult);
    }

    return { fileName: null, lineNumber: null, source: null };
  }

  private getSourceFromStackTrace(fn: Function): { fileName: string | null; lineNumber: number | null; source: string | null } | null {
    try {
      // Method 1: Try to get source location by invoking the function and catching the error
      // This is similar to what React DevTools does
      const location = this.getSourceByInvokingFunction(fn);
      if (location) {
        return location;
      }

      return null;
    } catch {
      return null;
    }
  }

  private getSourceByInvokingFunction(fn: Function): { fileName: string | null; lineNumber: number | null; source: string | null } | null {
    // Save current state
    const previousPrepareStackTrace = Error.prepareStackTrace;
    const previousStackTraceLimit = Error.stackTraceLimit;

    try {
      Error.stackTraceLimit = 50;

      // Create a fake React-like context to make the component throw in a predictable way
      // We'll use a Proxy to intercept any hooks and throw immediately
      const fakeReact = {
        useState: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useEffect: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useContext: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useReducer: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useCallback: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useMemo: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useRef: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useLayoutEffect: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useImperativeHandle: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
        useDebugValue: () => { throw new Error('__COMPONENT_SOURCE_CAPTURE__'); },
      };

      let capturedStack: string | null = null;

      try {
        // Try to call the function - it will likely throw immediately
        // because hooks won't work outside of React's render cycle
        fn({});
      } catch (e: any) {
        capturedStack = e?.stack || null;
      }

      if (!capturedStack) {
        // Try calling with no args
        try {
          fn();
        } catch (e: any) {
          capturedStack = e?.stack || null;
        }
      }

      if (capturedStack) {
        return this.parseStackForSource(capturedStack, fn.name);
      }

      return null;
    } catch {
      return null;
    } finally {
      Error.prepareStackTrace = previousPrepareStackTrace;
      Error.stackTraceLimit = previousStackTraceLimit;
    }
  }

  private parseStackForSource(stack: string, fnName?: string): { fileName: string | null; lineNumber: number | null; source: string | null } | null {
    const lines = stack.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip internal/framework lines
      if (line.includes('node_modules/react') ||
          line.includes('node_modules/react-dom') ||
          line.includes('node_modules/scheduler') ||
          line.includes('chrome-extension://') ||
          line.includes('extensions/') ||
          line.includes('__COMPONENT_SOURCE_CAPTURE__') ||
          line.includes('getSourceByInvokingFunction') ||
          line.includes('getSourceFromStackTrace') ||
          line.includes('getSourceInfo')) {
        continue;
      }

      // If we have a function name, look for it in the stack
      if (fnName && fnName !== 'anonymous' && line.includes(fnName)) {
        const parsed = this.parseStackLine(line);
        if (parsed) {
          return parsed;
        }
      }

      // Otherwise, look for the first non-framework source file
      // Check for common app source patterns
      if (line.includes('/src/') ||
          line.includes('/app/') ||
          line.includes('/components/') ||
          line.includes('/pages/') ||
          line.includes('/views/') ||
          line.includes('.tsx:') ||
          line.includes('.jsx:') ||
          line.includes('.ts:') ||
          line.includes('.js:')) {

        // Skip if it's clearly a dependency
        if (line.includes('node_modules')) {
          continue;
        }

        const parsed = this.parseStackLine(line);
        if (parsed) {
          return parsed;
        }
      }
    }

    // Fallback: try the first meaningful line after the error message
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('node_modules') ||
          line.includes('chrome-extension') ||
          line.includes('extensions/')) {
        continue;
      }

      const parsed = this.parseStackLine(line);
      if (parsed && parsed.fileName) {
        return parsed;
      }
    }

    return null;
  }

  private parseStackLine(line: string): { fileName: string | null; lineNumber: number | null; source: string | null } | null {
    // Chrome format: "    at ComponentName (http://localhost:3000/src/App.tsx:15:5)"
    // or: "    at http://localhost:3000/src/App.tsx:15:5"
    const chromeMatch = line.match(/\((.+):(\d+):(\d+)\)/) ||
                        line.match(/at\s+(.+):(\d+):(\d+)$/);
    if (chromeMatch) {
      const [, filePath, lineNum] = chromeMatch;
      const fileName = this.extractFileName(filePath);
      if (fileName) {
        return {
          fileName,
          lineNumber: parseInt(lineNum, 10),
          source: filePath,
        };
      }
    }

    // Firefox/Safari format: "ComponentName@http://localhost:3000/src/App.tsx:15:5"
    const firefoxMatch = line.match(/@(.+):(\d+):(\d+)/);
    if (firefoxMatch) {
      const [, filePath, lineNum] = firefoxMatch;
      const fileName = this.extractFileName(filePath);
      if (fileName) {
        return {
          fileName,
          lineNumber: parseInt(lineNum, 10),
          source: filePath,
        };
      }
    }

    return null;
  }

  private extractFileName(filePath: string): string | null {
    if (!filePath) return null;

    // Remove query strings and hashes
    let cleanPath = filePath.split('?')[0].split('#')[0];

    // Extract just the filename
    const parts = cleanPath.split('/');
    const fileName = parts[parts.length - 1];

    // Validate it looks like a source file
    if (fileName && /\.(jsx?|tsx?|mjs|cjs)$/.test(fileName)) {
      return fileName;
    }

    return fileName || null;
  }

  private isReactComponent(fiber: FiberNode): boolean {
    const { tag } = fiber;
    return (
      tag === FiberTags.FunctionComponent ||
      tag === FiberTags.ClassComponent ||
      tag === FiberTags.ForwardRef ||
      tag === FiberTags.MemoComponent ||
      tag === FiberTags.SimpleMemoComponent ||
      tag === FiberTags.ContextProvider ||
      tag === FiberTags.ContextConsumer ||
      tag === FiberTags.SuspenseComponent
    );
  }

  // Check if a component is a wrapper type that typically doesn't have useful source info
  private isWrapperComponent(fiber: FiberNode): boolean {
    const { tag, type } = fiber;

    // Context providers/consumers never have source
    if (tag === FiberTags.ContextProvider || tag === FiberTags.ContextConsumer) {
      return true;
    }

    // Suspense doesn't have source
    if (tag === FiberTags.SuspenseComponent) {
      return true;
    }

    // Check for common wrapper component names that are typically not useful
    const name = this.getComponentName(fiber);
    const wrapperNames = [
      'Provider',
      'Consumer',
      'Context',
      'Fragment',
      'Suspense',
      'StrictMode',
      'Profiler',
      // Common library wrappers
      'Router',
      'BrowserRouter',
      'HashRouter',
      'MemoryRouter',
      'StaticRouter',
      'ThemeProvider',
      'StylesProvider',
      'QueryClientProvider',
      'ReduxProvider',
    ];

    // Check if the name matches common wrapper patterns
    if (wrapperNames.some(w => name === w || name.endsWith('.Provider') || name.endsWith('.Consumer'))) {
      return true;
    }

    return false;
  }

  // Check if a component should be shown (has source or is a meaningful component)
  private shouldShowComponent(fiber: FiberNode): boolean {
    // Skip wrapper components (Context, Suspense, etc.)
    if (this.isWrapperComponent(fiber)) {
      return false;
    }

    const { tag } = fiber;
    const name = this.getComponentName(fiber);

    // Get source info - if it has source, definitely show it
    const { fileName } = this.getSourceInfo(fiber);
    if (fileName) {
      return true;
    }

    // Skip ForwardRef components without source (like styled-components)
    // The parent component that uses the styled component will have the source
    if (tag === FiberTags.ForwardRef) {
      return false;
    }

    // Skip Memo components without source
    if (tag === FiberTags.MemoComponent || tag === FiberTags.SimpleMemoComponent) {
      // Only show if there's a meaningful inner name
      if (name.startsWith('Memo(') && (name.includes('Anonymous') || name === 'Memo')) {
        return false;
      }
    }

    // Skip components with non-meaningful names and no source
    if (name === 'Unknown' || name === 'Anonymous') {
      return false;
    }

    // Skip styled-components patterns (they create ForwardRef wrappers)
    if (name.startsWith('Styled(') || name.startsWith('styled.')) {
      return false;
    }

    return true;
  }

  private getComponentsFromFiber(
    fiber: FiberNode | null,
    element: Element,
    depth: number = 0
  ): ComponentInfo[] {
    const components: ComponentInfo[] = [];

    if (!fiber || depth >= this.state.maxNestingLevel) {
      return components;
    }

    let currentFiber: FiberNode | null = fiber;

    // Traverse up the fiber tree to find React components
    while (currentFiber && components.length < this.state.maxNestingLevel) {
      // Check if this is a React component AND should be shown (not a wrapper)
      if (this.isReactComponent(currentFiber) && this.shouldShowComponent(currentFiber)) {
        const name = this.getComponentName(currentFiber);
        const { fileName, lineNumber, source } = this.getSourceInfo(currentFiber);

        // Get the DOM element associated with this fiber
        let fiberElement = this.findNearestHostFiber(currentFiber);

        if (fiberElement) {
          const rect = fiberElement.getBoundingClientRect();

          components.push({
            id: `${name}-${components.length}-${Date.now()}`,
            name,
            source,
            fileName,
            lineNumber,
            element: fiberElement,
            depth: components.length,
            rect,
          });
        }
      }

      currentFiber = currentFiber.return;
    }

    return components;
  }

  private findNearestHostFiber(fiber: FiberNode): Element | null {
    // If this fiber has a stateNode that's a DOM element, return it
    if (fiber.stateNode instanceof Element) {
      return fiber.stateNode;
    }

    // Otherwise, look for a child that has a DOM element
    let child = fiber.child;
    while (child) {
      if (child.tag === FiberTags.HostComponent && child.stateNode instanceof Element) {
        return child.stateNode;
      }
      child = child.child;
    }

    return null;
  }

  private getComponentsFromDOM(element: Element, depth: number = 0): ComponentInfo[] {
    const components: ComponentInfo[] = [];

    if (depth >= this.state.maxNestingLevel) {
      return components;
    }

    let currentElement: Element | null = element;

    while (currentElement && components.length < this.state.maxNestingLevel) {
      const fiber = this.getFiberFromElement(currentElement);

      if (fiber) {
        // Find the nearest React component for this DOM element that should be shown
        let componentFiber: FiberNode | null = fiber;
        while (componentFiber && !(this.isReactComponent(componentFiber) && this.shouldShowComponent(componentFiber))) {
          componentFiber = componentFiber.return;
        }

        if (componentFiber && this.isReactComponent(componentFiber) && this.shouldShowComponent(componentFiber)) {
          const name = this.getComponentName(componentFiber);
          const { fileName, lineNumber, source } = this.getSourceInfo(componentFiber);

          const rect = currentElement.getBoundingClientRect();

          // Avoid duplicates
          const isDuplicate = components.some(c => c.name === name && c.element === currentElement);

          if (!isDuplicate) {
            components.push({
              id: `${name}-${components.length}-${Date.now()}`,
              name,
              source,
              fileName,
              lineNumber,
              element: currentElement,
              depth: components.length,
              rect,
            });
          }
        }
      }

      currentElement = currentElement.parentElement;
    }

    return components;
  }

  private highlightComponentsAtElement(element: Element) {
    if (!this.overlayContainer) return;

    const fiber = this.getFiberFromElement(element);

    let components: ComponentInfo[];

    if (this.state.showReactTree && fiber) {
      // Use React tree traversal
      components = this.getComponentsFromFiber(fiber, element);
    } else {
      // Use DOM tree traversal
      components = this.getComponentsFromDOM(element);
    }

    this.renderHighlights(components);
  }

  private renderHighlights(components: ComponentInfo[]) {
    if (!this.overlayContainer) return;

    // Clear existing highlights
    this.overlayContainer.innerHTML = '';

    const colors = [
      'rgba(98, 216, 158, 0.4)',   // Green
      'rgba(100, 181, 246, 0.4)',  // Blue
      'rgba(255, 167, 38, 0.4)',   // Orange
      'rgba(239, 83, 80, 0.4)',    // Red
      'rgba(171, 71, 188, 0.4)',   // Purple
    ];

    const borderColors = [
      'rgb(98, 216, 158)',
      'rgb(100, 181, 246)',
      'rgb(255, 167, 38)',
      'rgb(239, 83, 80)',
      'rgb(171, 71, 188)',
    ];

    components.forEach((component, index) => {
      const { rect, name, fileName, lineNumber, depth } = component;
      const color = colors[index % colors.length];
      const borderColor = borderColors[index % borderColors.length];

      // Create highlight box
      const highlight = document.createElement('div');
      highlight.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background: ${color};
        border: 2px solid ${borderColor};
        pointer-events: none;
        box-sizing: border-box;
        z-index: ${2147483647 - depth};
      `;

      // Create label
      const label = document.createElement('div');
      const sourceText = fileName
        ? `${fileName}${lineNumber ? `:${lineNumber}` : ''}`
        : 'Source unknown';

      label.style.cssText = `
        position: absolute;
        top: ${rect.top - 24 < 0 ? rect.bottom : rect.top - 24}px;
        left: ${rect.left}px;
        background: ${borderColor};
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        z-index: ${2147483647 - depth};
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      `;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;
      nameSpan.style.cssText = 'font-weight: 600;';

      const sourceSpan = document.createElement('span');
      sourceSpan.textContent = ` · ${sourceText}`;
      sourceSpan.style.cssText = 'opacity: 0.85; font-weight: 400;';

      label.appendChild(nameSpan);
      label.appendChild(sourceSpan);

      this.overlayContainer!.appendChild(highlight);
      this.overlayContainer!.appendChild(label);
    });
  }

  private clearHighlights() {
    if (this.overlayContainer) {
      this.overlayContainer.innerHTML = '';
    }
  }

  private showAllHighlights() {
    // Just enable the mouse tracking - highlights appear on hover
    console.log('[React Highlighter] Enabled');
  }

  private hideAllHighlights() {
    this.clearHighlights();
    console.log('[React Highlighter] Disabled');
  }

  private refreshHighlights() {
    if (this.hoveredElement) {
      this.highlightComponentsAtElement(this.hoveredElement);
    }
  }
}

// Initialize the highlighter
new ReactComponentHighlighter();

export {};
