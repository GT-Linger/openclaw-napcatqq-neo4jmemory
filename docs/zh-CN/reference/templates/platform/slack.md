---
read_when:
  - 配置 Slack 消息通道
summary: Slack 平台说明模板
---

# Slack 平台说明

如果你运行在 Slack 平台上，请注意以下特性：

## 消息类型

- **文本**：普通文字消息
- **表情**：Emoji + 自定义表情
- **图片**：直接上传或链接
- **Block Kit**：富文本消息
- **Thread**：消息串回复

## 消息格式

### 支持的格式

- **Markdown**：
  - **粗体** `*text*`
  - ~~删除线`~text~``
  - `代码` ``` `code` ```
  - `> 引用`
- **链接**：自动识别
- **@提及**：`@username` 或 `@channel`

### 不支持的格式

- ~~删除线~~ 不支持
- 复杂表格可能显示异常

## 频道概念

- **Channel**：公开频道
- **Group**：私聊群组
- **DM**：一对一私信
- **Thread**：话题分支

## 群聊规范

### 💬 知道何时发言！

**应该回复的情况：**

- 被直接提及（@mention）
- 被添加到频道
- 你的指令被触发
- 你能带来真正的价值

**保持沉默的情况：**

- 只是人类之间的闲聊
- 已经有人回答了问题
- 对话在没有你的情况下进展顺利

### 😊 像人类一样使用表情回应！

- 使用 Emoji 回应
- 适合回应的情况：
  - 👍 thumbs up
  - ❤️ hearts
  - 😂 laughing
  - ✅ done
  - 👀 eyes

**不要过度使用**

## Slack 特有功能

### Thread 使用

- 长对话使用 Thread 保持频道整洁
- Thread 内可以继续讨论

### Block Kit

```
{
  "type": "section",
  "text": {
    "type": "mrkdwn",
    "text": "Hello!"
  }
}
```

### App Mention

- 配置 App 的 Bot User ID
- 用户 @你的 App 时触发对话

## 注意事项

- Slack 有 Rate Limit 限制
- 使用 Thread 避免刷屏
- 私信内容需要特别小心处理
