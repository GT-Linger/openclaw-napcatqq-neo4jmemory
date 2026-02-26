export type {
  SystemAutomationToolParams,
  SystemAutomationPlatform,
  SystemAutomationAction,
  SystemAutomationResult,
  SystemAutomationAuthorization,
  AuthorizationCallback,
  MousePosition,
  MouseOptions,
  ClickOptions,
  DragOptions,
  TypeOptions,
  HotkeyOptions,
  ScreenshotOptions,
  AppInfo,
  WindowInfo,
  ScreenInfo,
  PermissionStatus,
} from "./types.js";

export type { SystemAutomationTool, SystemAutomationToolInput } from "./tool.js";

export { createSystemAutomationTool } from "./tool.js";

export { macosAutomation } from "./macos.js";

export {
  createAuthorizationRequest,
  waitForAuthorization,
  resolveAuthorization,
  getPendingAuthorization,
  formatAuthorizationMessage,
  generateSecurityWarning,
  AUTHORIZATION_TIMEOUT_MS,
} from "./authorization.js";
