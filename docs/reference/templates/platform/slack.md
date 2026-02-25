---
read_when:
  - Configure Slack message channel
summary: Slack platform description template
---

# Slack Platform Description

If you are running on the Slack platform, please note the following features:

## Message Types

- **Text**: Regular text messages
- **Emoji**: Emoji + custom emoji
- **Images**: Upload directly or link
- **Block Kit**: Rich text messages
- **Thread**: Message thread replies

## Message Format

### Supported Formats

- **Markdown**:
  - **Bold** `*text*`
  - ~~Strikethrough~~`~text~``
  - `Code` ``` `code` ```
  - `> Quote`
- **Links**: Auto-recognized
- **@Mention**: `@username` or `@channel`

### Unsupported Formats

- ~~Strikethrough~~ not supported
- Complex tables may display abnormally

## Channel Concepts

- **Channel**: Public channel
- **Group**: Private group chat
- **DM**: Direct message one-on-one
- **Thread**: Topic branch

## Group Chat Guidelines

### 💬 Know When to Speak!

**When you SHOULD reply:**

- When directly mentioned (@mention)
- When added to a channel
- When your command is triggered
- When you can bring real value

**When to stay silent:**

- When it's just casual chat between humans
- When someone has already answered the question
- When the conversation is progressing fine without you

### 😊 Use Emoji Reactions Like Humans!

- Use Emoji to react
- Good situations for reactions:
  - 👍 thumbs up
  - ❤️ hearts
  - 😂 laughing
  - ✅ done
  - 👀 eyes

**Don't overuse**

## Slack-Specific Features

### Thread Usage

- Use Thread for long conversations to keep channels clean
- Continue discussions within Thread

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

- Configure App's Bot User ID
- Users @mention your App to trigger conversation

## Notes

- Slack has Rate Limit restrictions
- Use Thread to avoid flooding
- Be especially careful with direct message content
