import type { AgentToolResult } from "@mariozechner/pi-agent-core";

export type SystemAutomationAction =
  | "screenshot"
  | "screenshot:cursor"
  | "click"
  | "double_click"
  | "right_click"
  | "move_mouse"
  | "drag"
  | "type_text"
  | "press_key"
  | "hotkey"
  | "get_apps"
  | "activate_app"
  | "window_list"
  | "get_element"
  | "get_mouse_position"
  | "get_screen_size"
  | "check_permissions";

export interface MousePosition {
  x: number;
  y: number;
}

export interface MouseOptions {
  duration?: number;
}

export interface ClickOptions extends MouseOptions {
  button?: "left" | "right" | "middle";
}

export interface DragOptions {
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  duration?: number;
}

export interface TypeOptions {
  slowly?: boolean;
  delayMs?: number;
}

export interface HotkeyOptions {
  modifiers?: Array<"cmd" | "ctrl" | "shift" | "alt" | "meta">;
}

export interface ScreenshotOptions {
  display?: number;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  includeCursor?: boolean;
}

export interface AppInfo {
  name: string;
  bundleId?: string;
  pid?: number;
}

export interface WindowInfo {
  id: number;
  title: string;
  ownerName: string;
  ownerPid: number;
}

export interface ScreenInfo {
  width: number;
  height: number;
  scale: number;
}

export interface PermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
  automation: boolean;
}

export type SystemAutomationToolParams = {
  action: SystemAutomationAction;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  keyCode?: number;
  display?: number;
  appName?: string;
  modifiers?: Array<"cmd" | "ctrl" | "shift" | "alt" | "meta">;
  slowly?: boolean;
  delayMs?: number;
  duration?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  includeCursor?: boolean;
};

export type SystemAutomationResult = AgentToolResult<{
  success: boolean;
  action: SystemAutomationAction;
  result?: unknown;
  error?: string;
  requiresAuthorization?: boolean;
  authorizationTimeout?: number;
}>;

export interface SystemAutomationAuthorization {
  id: string;
  action: SystemAutomationAction;
  timestamp: number;
  expiresAt: number;
  details: string;
  status: "pending" | "approved" | "denied" | "expired";
}

export type AuthorizationCallback = (authorization: SystemAutomationAuthorization) => void;

export type SystemAutomationPlatform = "macos" | "windows" | "linux";
