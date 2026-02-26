import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { SystemAutomationPlatform, SystemAutomationToolParams } from "./system-automation/types.js";
import {
  createAuthorizationRequest,
  formatAuthorizationMessage,
  generateSecurityWarning,
} from "./system-automation/authorization.js";
import { executeMacOSAutomation } from "./system-automation/macos.js";

export type SystemAutomationToolInput = {
  platform: SystemAutomationPlatform;
  authorizationEnabled?: boolean;
};

const DEFAULT_SYSTEM_AUTOMATION_PLATFORM: SystemAutomationPlatform = "macos";

const SENSITIVE_ACTIONS: string[] = [
  "screenshot",
  "screenshot:cursor",
  "click",
  "double_click",
  "right_click",
  "move_mouse",
  "drag",
  "type_text",
  "press_key",
  "hotkey",
  "activate_app",
  "get_element",
];

export type SystemAutomationTool = AgentTool<
  {
    action: string;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    keyCode?: number;
    display?: number;
    appName?: string;
    modifiers?: string[];
    slowly?: boolean;
    delayMs?: number;
    duration?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    region?: { x: number; y: number; width: number; height: number };
    includeCursor?: boolean;
  },
  {
    success: boolean;
    action: string;
    result?: unknown;
    error?: string;
    requiresAuthorization?: boolean;
    authorizationId?: string;
    authorizationTimeout?: number;
  }
>;

export async function createSystemAutomationTool(
  input: SystemAutomationToolInput,
): Promise<SystemAutomationTool> {
  const platform = input.platform ?? DEFAULT_SYSTEM_AUTOMATION_PLATFORM;
  const authorizationEnabled = input.authorizationEnabled ?? true;

  const tool: SystemAutomationTool = {
    id: `system_automation_${platform}`,
    description: `System-level automation for ${platform}. Provides screen capture, mouse control, keyboard input, and window management.`,

    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "screenshot",
            "screenshot:cursor",
            "click",
            "double_click",
            "right_click",
            "move_mouse",
            "drag",
            "type_text",
            "press_key",
            "hotkey",
            "get_apps",
            "activate_app",
            "window_list",
            "get_element",
            "get_mouse_position",
            "get_screen_size",
            "check_permissions",
          ],
          description: "The automation action to perform",
        },
        x: {
          type: "number",
          description: "X coordinate for mouse operations",
        },
        y: {
          type: "number",
          description: "Y coordinate for mouse operations",
        },
        startX: {
          type: "number",
          description: "Start X coordinate for drag operations",
        },
        startY: {
          type: "number",
          description: "Start Y coordinate for drag operations",
        },
        endX: {
          type: "number",
          description: "End X coordinate for drag operations",
        },
        endY: {
          type: "number",
          description: "End Y coordinate for drag operations",
        },
        text: {
          type: "string",
          description: "Text to type",
        },
        key: {
          type: "string",
          description: "Key to press or modifier key for hotkey",
        },
        keyCode: {
          type: "number",
          description: "Key code for key press",
        },
        display: {
          type: "number",
          description: "Display number for screenshot (macOS)",
        },
        appName: {
          type: "string",
          description: "Application name to activate",
        },
        modifiers: {
          type: "array",
          items: {
            type: "string",
            enum: ["cmd", "ctrl", "shift", "alt", "meta"],
          },
          description: "Modifier keys for hotkey",
        },
        slowly: {
          type: "boolean",
          description: "Type text slowly to simulate human typing",
        },
        delayMs: {
          type: "number",
          description: "Delay between keystrokes when typing slowly",
        },
        duration: {
          type: "number",
          description: "Duration in milliseconds for mouse movement or drag",
        },
        region: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
          },
          description: "Region to capture for screenshot",
        },
        includeCursor: {
          type: "boolean",
          description: "Include cursor in screenshot (macOS)",
        },
      },
      required: ["action"],
    },

    execute: async (
      params: Record<string, unknown>,
    ): Promise<AgentToolResult<{ success: boolean; action: string; result?: unknown; error?: string; requiresAuthorization?: boolean; authorizationId?: string; authorizationTimeout?: number }>> => {
      const toolParams = params as unknown as SystemAutomationToolParams;

      const requiresAuth = SENSITIVE_ACTIONS.includes(toolParams.action);

      if (authorizationEnabled && requiresAuth) {
        const details = formatAuthorizationMessage(toolParams.action, toolParams);
        const authorization = createAuthorizationRequest(toolParams.action, details);

        return {
          content: [
            {
              type: "text" as const,
              text: generateSecurityWarning(toolParams.action),
            },
          ],
          details: {
            success: false,
            action: toolParams.action,
            requiresAuthorization: true,
            authorizationId: authorization.id,
            authorizationTimeout: 60000,
          },
        };
      }

      let result: { success: boolean; result?: unknown; error?: string };

      switch (platform) {
        case "macos":
          result = await executeMacOSAutomation(toolParams);
          break;
        case "windows":
        case "linux":
          return {
            content: [
              {
                type: "text" as const,
                text: `Platform ${platform} automation is not yet implemented.`,
              },
            ],
            details: {
              success: false,
              action: toolParams.action,
              error: "Platform not supported",
            },
          };
        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown platform: ${platform}`,
              },
            ],
            details: {
              success: false,
              action: toolParams.action,
              error: "Unknown platform",
            },
          };
      }

      if (!result.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${result.error}`,
            },
          ],
          details: {
            success: false,
            action: toolParams.action,
            error: result.error,
          },
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: result.result
              ? JSON.stringify(result.result, null, 2)
              : `Action ${toolParams.action} completed successfully`,
          },
        ],
        details: {
          success: true,
          action: toolParams.action,
          result: result.result,
        },
      };
    },
  };

  return tool;
}

export { type SystemAutomationPlatform };
