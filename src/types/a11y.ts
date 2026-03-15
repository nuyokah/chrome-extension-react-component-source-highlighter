// Shared types for the A11y Bridge feature

export interface A11yViolation {
  selector: string;
  violationDescription: string;
  wcagCriterion?: string;
}

export interface A11yComponentInfo {
  name: string;
  source: string | null;
  fileName: string | null;
  lineNumber: number | null;
}

export interface A11yComponentPayload {
  violation: A11yViolation;
  component: A11yComponentInfo;
}

// Message from popup -> background: initiate trace + send
export interface SendToVSCodeMessage {
  type: 'SEND_TO_VSCODE';
  violation: A11yViolation;
}

// Message from background -> content -> injected: trace a DOM selector
export interface TraceSelectorMessage {
  type: 'TRACE_SELECTOR';
  violation: A11yViolation;
}

// Message from injected -> content -> background: trace result
export interface TraceResultMessage {
  type: 'TRACE_RESULT';
  payload: A11yComponentPayload | null;
}

// Message from background -> popup: VS Code connection status
export interface VSCodeConnectedMessage {
  type: 'VSCODE_CONNECTED';
  connected: boolean;
}

// Wire message sent over WebSocket to VS Code
export interface WireMessage {
  type: 'A11Y_COMPONENT';
  payload: A11yComponentPayload;
}
