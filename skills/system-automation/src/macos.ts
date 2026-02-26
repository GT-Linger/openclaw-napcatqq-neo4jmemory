import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AppInfo, SystemAutomationToolParams, WindowInfo } from "./types.js";

const execAsync = promisify(exec);

export type MacOSAutomationConfig = {
  useAccessibilityAPI?: boolean;
};

export async function checkMacOSPermissions(): Promise<{
  accessibility: boolean;
  screenRecording: boolean;
  automation: boolean;
}> {
  const results = {
    accessibility: false,
    screenRecording: false,
    automation: false,
  };

  try {
    await execAsync(
      'osascript -e \'tell application "System Events" to tell process "Finder" to get name\'',
    );
    results.automation = true;
  } catch {
  }

  try {
    await execAsync("screencapture -x /tmp/test_screen.png 2>/dev/null && rm /tmp/test_screen.png");
    results.screenRecording = true;
  } catch {
  }

  try {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        return name of frontApp
      end tell
    `;
    await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
    results.accessibility = true;
  } catch {
  }

  return results;
}

export async function macosScreenshot(
  options?: {
    display?: number;
    region?: { x: number; y: number; width: number; height: number };
    includeCursor?: boolean;
  },
): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const filename = `screenshot_${Date.now()}.png`;
  const filepath = path.join(tmpDir, filename);

  let command = "screencapture";

  if (options?.includeCursor) {
    command += " -C";
  } else {
    command += " -x";
  }

  if (options?.region) {
    command += ` -R ${options.region.x},${options.region.y},${options.region.width},${options.region.height}`;
  } else if (options?.display) {
    command += ` -d ${options.display}`;
  }

  command += ` "${filepath}"`;

  await execAsync(command);

  if (!fs.existsSync(filepath)) {
    throw new Error("Screenshot failed - file not created");
  }

  const buffer = fs.readFileSync(filepath);
  fs.unlinkSync(filepath);

  return buffer;
}

async function runAccessibilityScript(script: string): Promise<string> {
  const escaped = script.replace(/'/g, "'\"'\"'");
  const { stdout } = await execAsync(`osascript -e '${escaped}'`);
  return stdout;
}

export async function macosClick(
  x: number,
  y: number,
  button: "left" | "right" | "middle" = "left",
): Promise<void> {
  const script = `
    tell application "System Events"
      set mousePos to {${x}, ${y}}
      ${button === "right" ? "set mousePos to current application's (do shell script \"echo $(/usr/bin/python3 -c 'import Quartz; e=Quartz.CGEventCreateMouseEvent(nil,6,Quartz.CGPointMake(\"${x}\",\"${y}\"),0); Quartz.CGEventPost(0,e)')\")" : ""}
      do shell script "python3 -c '
import Quartz
event = Quartz.CGEventCreateMouseEvent(None, ${button === "right" ? "Quartz.kCGEventRightMouseDown" : "Quartz.kCGEventLeftMouseDown"}, Quartz.CGPointMake(${x}, ${y}), ${button === "middle" ? "2" : button === "right" ? "1" : "0"})
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
event_up = Quartz.CGEventCreateMouseEvent(None, ${button === "right" ? "Quartz.kCGEventRightMouseUp" : "Quartz.kCGEventLeftMouseUp"}, Quartz.CGPointMake(${x}, ${y}), ${button === "middle" ? "2" : button === "right" ? "1" : "0"})
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event_up)
'"
    end tell
  `;

  try {
    await runAccessibilityScript(script);
  } catch {
    const fallback = `
      tell application "System Events"
        set mousePos to {${x}, ${y}}
      end tell
      do shell script "echo 'click at ${x},${y}'"
    `;
    await runAccessibilityScript(fallback);
  }
}

export async function macosDoubleClick(x: number, y: number): Promise<void> {
  const script = `
    tell application "System Events"
      set mousePos to {${x}, ${y}}
    end tell
    do shell script "python3 -c '
import Quartz
pos = Quartz.CGPointMake(${x}, ${y})
event_down = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pos, 0)
event_up = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pos, 0)
Quartz.CGEventSetIntegerValueField(event_down, Quartz.kCGMouseEventClickState, 2)
Quartz.CGEventSetIntegerValueField(event_up, Quartz.kCGMouseEventClickState, 2)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event_down)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event_up)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event_down)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event_up)
'"
  `;
  await runAccessibilityScript(script);
}

export async function macosRightClick(x: number, y: number): Promise<void> {
  await macosClick(x, y, "right");
}

export async function macosMoveMouse(
  x: number,
  y: number,
  duration: number = 0,
): Promise<void> {
  if (duration > 0) {
    const steps = Math.max(10, Math.floor(duration / 16));
    const script = `
      tell application "System Events"
        set mousePos to {${x}, ${y}}
      end tell
      do shell script "python3 -c '
import Quartz
import time
start_x, start_y = $(python3 -c 'import Quartz; pos=Quartz.NSEvent.mouseLocation(); print(int(pos.x), int(Quartz.NSScreen.mainScreen().frame().size.height-pos.y))').split()
start_x, start_y = int(start_x), int(start_y)
end_x, end_y = ${x}, ${y}
duration = ${duration} / 1000.0
steps = ${steps}
for i in range(steps + 1):
    t = i / steps
    cur_x = int(start_x + (end_x - start_x) * t)
    cur_y = int(start_y + (end_y - start_y) * t)
    event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, Quartz.CGPointMake(cur_x, cur_y), 0)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
    time.sleep(duration / steps)
'"
    `;
    await runAccessibilityScript(script);
  } else {
    const script = `
      tell application "System Events"
        set mousePos to {${x}, ${y}}
      end tell
      do shell script "python3 -c '
import Quartz
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, Quartz.CGPointMake(${x}, ${y}), 0)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
'"
    `;
    await runAccessibilityScript(script);
  }
}

export async function macosDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration: number = 500,
): Promise<void> {
  const steps = Math.max(10, Math.floor(duration / 16));
  const script = `
    do shell script "python3 -c '
import Quartz
import time
start_pos = Quartz.CGPointMake(${startX}, ${startY})
end_pos = Quartz.CGPointMake(${endX}, ${endY})

mouseDown = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, start_pos, 0)
mouseDrag = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDragged, start_pos, 0)
mouseUp = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, end_pos, 0)

Quartz.CGEventPost(Quartz.kCGHIDEventTap, mouseDown)
time.sleep(0.05)

steps = ${steps}
for i in range(1, steps + 1):
    t = i / steps
    cur_x = int(${startX} + (${endX} - ${startX}) * t)
    cur_y = int(${startY} + (${endY} - ${startY}) * t)
    event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDragged, Quartz.CGPointMake(cur_x, cur_y), 0)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
    time.sleep(${duration} / 1000.0 / steps)

mouseUp = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, Quartz.CGPointMake(${endX}, ${endY}), 0)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, mouseUp)
'"
  `;
  await runAccessibilityScript(script);
}

const KEY_CODE_MAP: Record<string, number> = {
  a: 0, b: 11, c: 8, d: 2, e: 14, f: 3, g: 5, h: 4, i: 34, j: 38,
  k: 40, l: 37, m: 46, n: 45, o: 31, p: 35, q: 12, r: 15, s: 1, t: 17,
  u: 32, v: 9, w: 13, x: 7, y: 16, z: 6,
  "0": 29, "1": 18, "2": 19, "3": 20, "4": 21, "5": 23, "6": 22, "7": 26, "8": 28, "9": 25,
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, escape: 53,
  left: 123, right: 124, down: 125, up: 126,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
};

export async function macosTypeText(
  text: string,
  slowly: boolean = false,
  delayMs: number = 75,
): Promise<void> {
  if (slowly) {
    for (const char of text) {
      const escaped = char.replace(/"/g, '\\"');
      const script = `
        tell application "System Events"
          keystroke "${escaped}"
        end tell
      `;
      await runAccessibilityScript(script);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  } else {
    const escaped = text.replace(/"/g, '\\"');
    const script = `
      tell application "System Events"
        keystroke "${escaped}"
      end tell
    `;
    await runAccessibilityScript(script);
  }
}

export async function macosPressKey(key: string): Promise<void> {
  const keyCode = KEY_CODE_MAP[key.toLowerCase()];

  if (keyCode !== undefined) {
    const script = `
      tell application "System Events"
        key code ${keyCode}
      end tell
    `;
    await runAccessibilityScript(script);
  } else {
    const escaped = key.replace(/"/g, '\\"');
    const script = `
      tell application "System Events"
        keystroke "${escaped}"
      end tell
    `;
    await runAccessibilityScript(script);
  }
}

export async function macosHotKey(
  keys: string[],
  modifiers: Array<"cmd" | "ctrl" | "shift" | "alt" | "meta"> = [],
): Promise<void> {
  const modifierPart = modifiers
    .map((m) => {
      const map: Record<string, string> = {
        cmd: "command",
        ctrl: "control",
        shift: "shift",
        alt: "option",
        meta: "command",
      };
      return map[m] || m;
    })
    .join(", ");

  const keyPart = keys.join("");

  const script = `
    tell application "System Events"
      keystroke "${keyPart}" using {${modifierPart} down}
    end tell
  `;
  await runAccessibilityScript(script);
}

export async function macosGetRunningApps(): Promise<AppInfo[]> {
  const script = `
    tell application "System Events"
      set appList to {}
      repeat with proc in (every process whose background only is false)
        try
          set procName to name of proc
          try
            set procId to bundle identifier of proc
            set end of appList to procName & "|" & procId
          on error
            set end of appList to procName & "|"
          end try
        on error
        end try
      end repeat
      return appList
    end tell
  `;

  const stdout = await runAccessibilityScript(script);

  const apps: AppInfo[] = [];
  const lines = stdout.trim().split(", ");

  for (const line of lines) {
    const [name, bundleId] = line.split("|");
    if (name) {
      apps.push({
        name: name.trim(),
        bundleId: bundleId?.trim() || undefined,
      });
    }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function macosActivateApp(appName: string): Promise<void> {
  const escaped = appName.replace(/"/g, '\\"');
  const script = `
    tell application "${escaped}"
      activate
    end tell
  `;
  await runAccessibilityScript(script);
}

export async function macosGetWindowList(): Promise<WindowInfo[]> {
  const script = `
    tell application "System Events"
      set windowList to {}
      repeat with proc in (every process whose background only is false)
        try
          set procName to name of proc
          repeat with win in (every window of proc)
            try
              set winTitle to name of win
              if winTitle is not equal to "" then
                set winId to id of win
                set end of windowList to winId & "|" & winTitle & "|" & procName
              end if
            on error
            end try
          end repeat
        on error
        end try
      end repeat
      return windowList
    end tell
  `;

  const stdout = await runAccessibilityScript(script);

  const windows: WindowInfo[] = [];
  const lines = stdout.trim().split(", ");

  for (const line of lines) {
    const parts = line.trim().split("|");
    if (parts.length >= 3) {
      const title = parts[1].trim();
      if (title && title !== "") {
        windows.push({
          id: parseInt(parts[0], 10) || 0,
          title: title,
          ownerName: parts[2].trim(),
          ownerPid: 0,
        });
      }
    }
  }

  return windows;
}

export async function macosGetElementAtPosition(
  x: number,
  y: number,
): Promise<Record<string, unknown>> {
  const script = `
    tell application "System Events"
      tell process "System Events"
        set elemInfo to {}
        set pos to ${x}
        
        try
          set frontProc to first process whose frontmost is true
          set procName to name of frontProc
          set end of elemInfo to "process:" & procName
        end try
        
        try
          set uiElements to entire contents of frontProc
          repeat with uiElem in uiElements
            try
              set elemPos to position of uiElem
              set elemSize to size of uiElem
              set elemX to item 1 of elemPos
              set elemY to item 2 of elemPos
              set elemWidth to item 1 of elemSize
              set elemHeight to item 2 of elemSize
              
              if ${x} >= elemX and ${x} <= (elemX + elemWidth) and ${y} >= elemY and ${y} <= (elemY + elemHeight) then
                set end of elemInfo to "role:" & value of attribute "AXRole" of uiElem
                try
                  set end of elemInfo to "title:" & value of attribute "AXTitle" of uiElem
                end try
                try
                  set end of elemInfo to "description:" & value of attribute "AXDescription" of uiElem
                end try
                try
                  set end of elemInfo to "value:" & value of attribute "AXValue" of uiElem
                end try
                try
                  set end of elemInfo to "enabled:" & value of attribute "AXEnabled" of uiElem
                end try
                exit repeat
              end if
            on error
            end try
          end repeat
        on error
        end try
        
        return elemInfo
      end tell
    end tell
  `;

  try {
    const stdout = await runAccessibilityScript(script);

    const element: Record<string, string> = {};
    const lines = stdout.trim().split(", ");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        if (key && value) {
          element[key] = value;
        }
      }
    }

    return {
      ...element,
      x,
      y,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      x,
      y,
    };
  }
}

export async function macosGetScreenSize(): Promise<{
  width: number;
  height: number;
  scale: number;
}> {
  const script = `
    tell application "System Events"
      set mainScreen to first desktop
      set screenHeight to (height of mainScreen)
      set screenWidth to (width of mainScreen)
      return screenWidth & "|" & screenHeight & "|2"
    end tell
  `;

  const stdout = await runAccessibilityScript(script);
  const [width, height, scale] = stdout.trim().split("|");

  return {
    width: parseInt(width, 10) || 1920,
    height: parseInt(height, 10) || 1080,
    scale: parseInt(scale, 10) || 2,
  };
}

export async function macosGetMousePosition(): Promise<{ x: number; y: number }> {
  const script = `
    tell application "System Events"
      set mousePos to (get mouse location)
      return (item 1 of mousePos) & "," & (item 2 of mousePos)
    end tell
  `;

  const stdout = await runAccessibilityScript(script);
  const [x, y] = stdout.trim().split(",");

  return {
    x: parseInt(x, 10) || 0,
    y: parseInt(y, 10) || 0,
  };
}

export async function executeMacOSAutomation(
  params: SystemAutomationToolParams,
): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  try {
    switch (params.action) {
      case "screenshot": {
        const buffer = await macosScreenshot({
          display: params.display,
          region: params.region,
          includeCursor: false,
        });
        return {
          success: true,
          result: {
            type: "image",
            data: buffer.toString("base64"),
            mimeType: "image/png",
            size: buffer.length,
          },
        };
      }

      case "screenshot:cursor": {
        const buffer = await macosScreenshot({
          display: params.display,
          region: params.region,
          includeCursor: true,
        });
        return {
          success: true,
          result: {
            type: "image",
            data: buffer.toString("base64"),
            mimeType: "image/png",
            size: buffer.length,
          },
        };
      }

      case "click":
        await macosClick(params.x ?? 0, params.y ?? 0, "left");
        return { success: true };

      case "double_click":
        await macosDoubleClick(params.x ?? 0, params.y ?? 0);
        return { success: true };

      case "right_click":
        await macosRightClick(params.x ?? 0, params.y ?? 0);
        return { success: true };

      case "move_mouse":
        await macosMoveMouse(params.x ?? 0, params.y ?? 0, params.duration ?? 0);
        return { success: true };

      case "drag": {
        await macosDrag(
          params.startX ?? 0,
          params.startY ?? 0,
          params.endX ?? 0,
          params.endY ?? 0,
          params.duration ?? 500,
        );
        return { success: true };
      }

      case "type_text":
        await macosTypeText(params.text ?? "", params.slowly ?? false, params.delayMs ?? 75);
        return { success: true };

      case "press_key":
        await macosPressKey(params.key ?? "");
        return { success: true };

      case "hotkey":
        await macosHotKey([params.key ?? ""], params.modifiers ?? []);
        return { success: true };

      case "get_apps":
        const apps = await macosGetRunningApps();
        return { success: true, result: apps };

      case "activate_app":
        await macosActivateApp(params.appName ?? "");
        return { success: true };

      case "window_list":
        const windows = await macosGetWindowList();
        return { success: true, result: windows };

      case "get_element":
        const element = await macosGetElementAtPosition(params.x ?? 0, params.y ?? 0);
        return { success: true, result: element };

      case "get_mouse_position":
        const pos = await macosGetMousePosition();
        return { success: true, result: pos };

      case "get_screen_size":
        const screen = await macosGetScreenSize();
        return { success: true, result: screen };

      case "check_permissions":
        const perms = await checkMacOSPermissions();
        return { success: true, result: perms };

      default:
        return {
          success: false,
          error: `Unknown action: ${params.action}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const macosAutomation = {
  checkPermissions: checkMacOSPermissions,
  screenshot: macosScreenshot,
  click: macosClick,
  doubleClick: macosDoubleClick,
  rightClick: macosRightClick,
  moveMouse: macosMoveMouse,
  drag: macosDrag,
  typeText: macosTypeText,
  pressKey: macosPressKey,
  hotKey: macosHotKey,
  getRunningApps: macosGetRunningApps,
  activateApp: macosActivateApp,
  getWindowList: macosGetWindowList,
  getElementAtPosition: macosGetElementAtPosition,
  getMousePosition: macosGetMousePosition,
  getScreenSize: macosGetScreenSize,
  execute: executeMacOSAutomation,
};
