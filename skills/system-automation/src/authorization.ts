import crypto from "node:crypto";
import type {
  SystemAutomationAction,
  SystemAutomationAuthorization,
  SystemAutomationToolParams,
} from "./types.js";

const AUTHORIZATION_TIMEOUT_MS = 60_000;

const pendingAuthorizations = new Map<
  string,
  {
    authorization: SystemAutomationAuthorization;
    resolve: (auth: SystemAutomationAuthorization) => void;
    reject: (error: Error) => void;
  }
>();

export function createAuthorizationRequest(
  action: SystemAutomationAction,
  details: string,
): SystemAutomationAuthorization {
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  const authorization: SystemAutomationAuthorization = {
    id,
    action,
    timestamp,
    expiresAt: timestamp + AUTHORIZATION_TIMEOUT_MS,
    details,
    status: "pending",
  };
  return authorization;
}

export function waitForAuthorization(id: string): Promise<SystemAutomationAuthorization> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const pending = pendingAuthorizations.get(id);
      if (pending) {
        pending.reject(new Error("Authorization request timed out"));
        pendingAuthorizations.delete(id);
      }
    }, AUTHORIZATION_TIMEOUT_MS);

    pendingAuthorizations.set(id, {
      authorization: createAuthorizationRequest("screenshot", ""),
      resolve: (auth) => {
        clearTimeout(timeout);
        resolve(auth);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
  });
}

export function resolveAuthorization(
  id: string,
  approved: boolean,
): SystemAutomationAuthorization | null {
  const pending = pendingAuthorizations.get(id);
  if (!pending) {
    return null;
  }

  const updatedAuth: SystemAutomationAuthorization = {
    ...pending.authorization,
    status: approved ? "approved" : "denied",
  };

  pending.resolve(updatedAuth);
  pendingAuthorizations.delete(id);

  return updatedAuth;
}

export function getPendingAuthorization(id: string): SystemAutomationAuthorization | null {
  const pending = pendingAuthorizations.get(id);
  return pending?.authorization ?? null;
}

export function formatAuthorizationMessage(
  action: SystemAutomationAction,
  params: SystemAutomationToolParams,
): string {
  const actionDetails: Record<SystemAutomationAction, string> = {
    screenshot: `屏幕截图 (显示 ${params.display ?? 1}, 区域: ${params.region ? `${params.region.width}x${params.region.height}` : "全屏"})`,
    "screenshot:cursor": `屏幕截图(含光标) (显示 ${params.display ?? 1})`,
    click: `鼠标点击 (${params.x}, ${params.y})`,
    double_click: `鼠标双击 (${params.x}, ${params.y})`,
    right_click: `鼠标右键点击 (${params.x}, ${params.y})`,
    move_mouse: `鼠标移动到 (${params.x}, ${params.y})`,
    drag: `鼠标拖拽 (${params.startX}, ${params.startY}) → (${params.endX}, ${params.endY})`,
    type_text: `输入文本: "${truncateText(params.text ?? "", 50)}"${params.slowly ? " (慢速输入)" : ""}`,
    press_key: `按下按键: ${params.key ?? params.keyCode ?? "unknown"}`,
    hotkey: `快捷键: ${[...(params.modifiers ?? []), params.key].join("+")}`,
    get_apps: `获取运行中的应用列表`,
    activate_app: `激活应用: ${params.appName}`,
    window_list: `获取窗口列表`,
    get_element: `获取界面元素于 (${params.x}, ${params.y})`,
    get_mouse_position: `获取当前鼠标位置`,
    get_screen_size: `获取屏幕尺寸`,
    check_permissions: `检查系统权限状态`,
  };

  return actionDetails[action] || `执行操作: ${action}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

export function generateSecurityWarning(action: SystemAutomationAction): string {
  const warnings: Record<SystemAutomationAction, string> = {
    screenshot: "此操作将截取屏幕内容，可能包含敏感信息。",
    "screenshot:cursor": "此操作将截取屏幕内容(含光标)，可能包含敏感信息。",
    click: "此操作将模拟鼠标点击指定位置。",
    double_click: "此操作将模拟鼠标双击指定位置。",
    right_click: "此操作将模拟鼠标右键点击指定位置。",
    move_mouse: "此操作将移动鼠标到指定位置。",
    drag: "此操作将执行鼠标拖拽操作。",
    type_text: "此操作将向系统输入文本内容。",
    press_key: "此操作将模拟按键操作。",
    hotkey: "此操作将执行快捷键组合。",
    get_apps: "此操作将获取当前运行的应用程序列表。",
    activate_app: "此操作将激活(切换到)指定应用。",
    window_list: "此操作将获取当前窗口列表。",
    get_element: "此操作将获取指定位置的界面元素信息。",
    get_mouse_position: "此操作将获取当前鼠标位置。",
    get_screen_size: "此操作将获取屏幕分辨率信息。",
    check_permissions: "此操作将检查系统权限状态。",
  };

  return `⚠️ 安全确认请求

操作类型: ${action}
说明: ${warnings[action] || "系统自动化操作"}
时间: ${new Date().toLocaleString()}

请回复 "确认" 允许操作，或 "拒绝" 取消操作。`;
}

export { AUTHORIZATION_TIMEOUT_MS };
