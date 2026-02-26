---
name: system-automation
description: "系统级自动化 (System-level automation): 屏幕截图、鼠标/键盘控制、窗口管理、UI元素检查。适用于: 用户想要自动化应用、控制鼠标键盘、截取屏幕或与任何应用交互。⚠️ 警告 (WARNING): 此技能可控制鼠标键盘和截取屏幕,请谨慎使用。This skill can control mouse/keyboard and capture screen. Use with caution."
homepage: https://developer.apple.com/documentation/apple-script
metadata:
  {
    "openclaw":
      {
        "emoji": "⚙️",
        "os": ["darwin", "win32", "linux"],
        "warning": "此技能可控制鼠标键盘和截取屏幕,需要提升权限。仅当用户明确请求系统自动化时使用。This skill can control mouse/keyboard and capture screen. Requires elevated permissions. Use only when user explicitly requests system automation.",
      },
  }
---

# 系统自动化技能 / System Automation Skill

⚠️ **警告 (WARNING): 此技能具有重要的安全影响! / This skill has significant security implications!**

## 安全风险 / Security Risks

| 风险 / Risk | 描述 / Description | 缓解措施 / Mitigation |
|------|-------------|------------|
| 🔴 **键盘/鼠标控制** / Keyboard/Mouse Control | 可模拟任何键击或点击 / Can simulate any keystroke or click | 仅在用户明确要求时使用 / Only use when user explicitly requests |
| 🔴 **屏幕截图** / Screen Capture | 可捕获敏感信息 / Can capture sensitive information | 小心处理,不记录输出 / Handle with care, don't log output |
| 🟠 **应用控制** / App Control | 可激活/控制任何应用 / Can activate/control any application | 激活前验证目标应用 / Verify target app before activation |
| 🟠 **数据泄露** / Data Exposure | 鼠标位置/截图可能包含敏感数据 / Mouse position/screenshot may contain sensitive data | 最小化日志,使用后清除 / Minimize logging, clear after use |

## 平台支持 / Platform Support

| 平台 / Platform | 库 / Library | 所需权限 / Required Permissions |
|----------|---------|---------------------|
| macOS | PyObjC (Quartz) | 辅助功能 / Accessibility |
| Windows | pywin32 | 管理员(部分功能) / Admin (some features) |
| Linux | python-xlib | X11访问 / X11 access |

## 何时使用 / When to Use

✅ **使用此技能的场景 / USE this skill when:**

- 用户想要截取屏幕或特定区域 / User wants to capture screen or specific regions
- 用户想要自动化鼠标点击、移动或拖拽 / User wants to automate mouse clicks, movements, or drags
- 用户想要输入文本或按键盘快捷键 / User wants to type text or press keyboard shortcuts
- 用户想要获取运行中的应用或窗口列表 / User wants to get list of running applications or windows
- 用户想要激活或控制任何应用 / User wants to activate or control any application
- 用户想要检查特定屏幕位置的UI元素 / User wants to inspect UI elements at specific screen positions
- 用户想要获取当前鼠标位置或屏幕尺寸 / User wants to get current mouse position or screen size

❌ **不要使用此技能的场景 / DON'T use this skill when:**

- 需要浏览器自动化(请使用浏览器工具) / Browser automation is needed (use browser tool instead)
- 未授予平台特定权限 / Platform-specific permissions are not granted
- 用户未明确请求系统自动化 / User hasn't explicitly requested system automation
- 未经授权操作敏感/机密数据 / Operating on sensitive/confidential data without approval

## ⚠️ 所需权限 / Required Permissions

此技能需要提升的系统权限才能运行 / This skill requires elevated system permissions to function:

### macOS

在**系统设置 → 隐私与安全性 → 辅助功能**中授予辅助功能权限 / Grant Accessibility permissions in **System Settings → Privacy & Security → Accessibility**:

```bash
# 检查权限 / Check permissions
system-automation check-permissions
```

### Windows

需要管理员权限才能实现完整自动化支持 / Run as Administrator for full automation support.

### Linux

确保X11正在运行且用户有权限 / Ensure X11 is running and user has permission:

```bash
# 检查X11访问 / Check X11 access
xauth list
```

## 命令 (所有平台) / Commands (All Platforms)

### 屏幕截图 / Screen Capture

```bash
# 全屏截图 / Full screen capture
system-automation screenshot

# 截取特定区域 (x,y,宽,高) / Capture specific region (x,y,width,height)
system-automation screenshot --region "100,100,800,600"
```

### 鼠标控制 / Mouse Control

```bash
# 点击位置 / Click at position
system-automation click 500 300

# 双击 / Double click
system-automation double-click 500 300

# 右键点击 / Right click
system-automation right-click 500 300

# 移动鼠标(瞬间) / Move mouse (instant)
system-automation move 800 600

# 带动画移动鼠标(500毫秒) / Move mouse with animation (500ms)
system-automation move 800 600 --duration 500

# 拖拽从起点到终点 / Drag from start to end
system-automation drag 100 100 500 500 --duration 1000
```

### 键盘控制 / Keyboard Control

```bash
# 输入文本 / Type text
system-automation type "Hello World"

# 慢速输入(模拟人工打字) / Type slowly (simulates human typing)
system-automation type "Hello World" --slow

# 按单个键 / Press single key
system-automation key enter
system-automation key escape

# 按组合键(热键) / Press key combination (hotkey)
system-automation hotkey c --modifiers ctrl
system-automation hotkey v --modifiers ctrl,shift
```

### 应用和窗口管理 / Application & Window Management

```bash
# 获取运行中的应用列表 / Get list of running apps
system-automation get-apps

# 获取窗口列表 / Get list of windows
system-automation get-windows

# 激活应用程序 / Activate application
system-automation activate "Safari"
system-automation activate "Notepad"
```

### 屏幕和位置信息 / Screen & Position Info

```bash
# 获取当前鼠标位置 / Get current mouse position
system-automation mouse-position

# 获取屏幕尺寸 / Get screen size
system-automation screen-size

# 获取指定位置的UI元素 / Get UI element at position
system-automation element-at 500 300
```

### 权限检查 / Permission Check

```bash
# 检查所有所需权限 / Check all required permissions
system-automation check-permissions
```

## 平台特定说明 / Platform-Specific Notes

### macOS

- 使用PyObjC的Quartz框架 / Uses Quartz framework via PyObjC
- 最可靠的像素级自动化 / Most reliable for pixel-perfect automation
- 需要辅助功能权限(系统设置 → 隐私与安全性) / Requires Accessibility permissions

### Windows

- 使用pywin32和Windows API / Uses pywin32 and Windows API
- 部分功能需要管理员权限 / Some features require Administrator privileges
- 适用于大多数Windows应用程序 / Works with most Windows applications

### Linux

- 使用python-xlib进行X11自动化 / Uses python-xlib for X11 automation
- 需要X11会话(不支持Wayland) / Requires X11 session (not Wayland)
- 可能需要`xhost +local:`才能进行某些操作 / May need `xhost +local:` for some operations

## 键位代码参考 (macOS) / Key Codes Reference (macOS)

| 按键 / Key | 代码 / Code |
|-----|------|
| enter | 36 |
| return | 36 |
| tab | 48 |
| space | 49 |
| delete | 51 |
| escape | 53 |
| left | 123 |
| right | 124 |
| down | 125 |
| up | 126 |
| a-z | 0-25 |
| 0-9 | 18-29 |
| f1-f12 | 122,120,99,118,96,97,98,100,101,109,103,111 |

## 示例 / Examples

**截取屏幕 / Take a screenshot:**
```bash
system-automation screenshot --output ~/Desktop/screenshot.png
```

**点击按钮 / Click on a button:**
```bash
system-automation click 400 200
```

**在活动字段中输入 / Type into active field:**
```bash
system-automation type "my-text"
```

**获取所有可见窗口 / Get all visible windows:**
```bash
system-automation get-windows
```

**检查权限 / Check permissions:**
```bash
system-automation check-permissions
```

## ⚠️ 安全最佳实践 / Security Best Practices

1. **始终与用户确认** / **Always confirm with user** - 执行任何自动化操作前 / before performing any automation action
2. **最小化日志** / **Minimize logging** - 避免记录截图数据或敏感内容 / Avoid logging screenshot data or sensitive content
3. **验证目标应用** / **Verify target apps** - 激活前确认正确的应用程序 / Confirm the correct application before activating
4. **清除敏感数据** / **Clear sensitive data** - 使用后删除临时截图 / Delete temporary screenshots after use
5. **使用慢速输入** / **Use slow typing** - 考虑使用`--slow`标志使输入看起来更自然 / Consider `--slow` flag for text input to appear natural
6. **尊重用户意图** / **Respect user intent** - 仅自动化用户明确要求的操作 / Only automate actions user explicitly requests

## 🔒 权限状态 / Permission States

| 权限 / Permission | 风险等级 / Risk Level | 描述 / Description |
|------------|------------|-------------|
| 辅助功能 (macOS) / Accessibility (macOS) | 🔴 高 / 🔴 High | 所有自动化必需 / Required for all automation |
| 屏幕录制 (macOS) / Screen Recording (macOS) | 🔴 高 / 🔴 High | 截图必需 / Required for screenshots |
| 管理员 (Windows) / Admin (Windows) | 🔴 高 / 🔴 High | 部分功能需要 / Required for some features |
| X11 (Linux) | 🟠 中 / 🟠 Medium | X11自动化必需 / Required for X11 automation |

⚠️ **重要 / Important**: 仅在理解含义后才授予这些权限。滥用可能导致未经授权的访问或数据泄露。/ Grant these permissions only after understanding the implications. Misuse can lead to unauthorized access or data exposure.
