---
title: NapCatQQ
description: Connect OpenClaw to QQ via NapCatQQ with OneBot 11 protocol.
---

Use NapCatQQ when you want OpenClaw to work with QQ messaging platform. NapCatQQ implements the OneBot 11 protocol, allowing OpenClaw to receive and send messages through QQ.

NapCatQQ ships as an extension plugin, configured in the main config under `channels.napcatqq`.

## Architecture

OpenClaw acts as a WebSocket server, and NapCatQQ connects as a client using reverse WebSocket:

```
┌─────────────────┐         Reverse WebSocket        ┌─────────────────┐
│                 │ ◄────────────────────────────── │                 │
│    OpenClaw     │                                 │    NapCatQQ     │
│  (WS Server)    │ ──────────────────────────────► │  (WS Client)    │
│                 │         API Calls/Events        │                 │
└─────────────────┘                                 └─────────────────┘
     :3001                                                QQ Protocol
```

## Quick start

1. Enable NapCatQQ config in `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "napcatqq": {
      "wsPort": 3001,
      "accessToken": "your-secure-token"
    }
  }
}
```

2. Configure NapCatQQ to use reverse WebSocket:

```json
{
  "reverseWs": {
    "enable": true,
    "urls": ["ws://127.0.0.1:3001/onebot/v11/ws"]
  },
  "accessToken": "your-secure-token"
}
```

3. Start/restart gateway:

```bash
openclaw gateway run
```

## Security defaults

- `channels.napcatqq.dmPolicy` defaults to `"pairing"`.
- `channels.napcatqq.groupPolicy` defaults to `"allowlist"`.
- With `groupPolicy="allowlist"`, set `channels.napcatqq.groups` to define allowed groups.
- Use `accessToken` to secure the WebSocket connection.

## Connection parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `wsPort` | number | 3001 | WebSocket server port |
| `wsHost` | string | "127.0.0.1" | WebSocket server host |
| `wsPath` | string | "/onebot/v11/ws" | WebSocket path |
| `accessToken` | string | - | Access token for authentication |

## Advanced configuration

### Reconnection settings

Configure automatic reconnection when connection is lost:

```json
{
  "channels": {
    "napcatqq": {
      "reconnect": {
        "enabled": true,
        "maxRetries": 10,
        "retryDelay": 5000,
        "backoffMultiplier": 2,
        "maxDelay": 60000
      }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable reconnection |
| `maxRetries` | number | 10 | Maximum retry attempts |
| `retryDelay` | number | 5000 | Initial retry delay (ms) |
| `backoffMultiplier` | number | 2 | Exponential backoff multiplier |
| `maxDelay` | number | 60000 | Maximum retry delay (ms) |

### Heartbeat settings

Configure heartbeat detection to monitor connection health:

```json
{
  "channels": {
    "napcatqq": {
      "heartbeat": {
        "enabled": true,
        "interval": 30000,
        "timeout": 10000
      }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable heartbeat |
| `interval` | number | 30000 | Heartbeat interval (ms) |
| `timeout` | number | 10000 | Request timeout (ms) |

## API functions

### Group management

#### Set group admin

```typescript
await setGroupAdmin(accountId, groupId, userId, true);
```

#### Set group mute

```typescript
await setGroupMute(accountId, groupId, userId, 600);
```

#### Kick group member

```typescript
await kickGroupMember(accountId, groupId, userId, false);
```

#### Set group whole mute

```typescript
await setGroupWholeMute(accountId, groupId, true);
```

#### Set group name

```typescript
await setGroupName(accountId, groupId, "New Group Name");
```

#### Get group member info

```typescript
const memberInfo = await getGroupMemberInfo(accountId, groupId, userId, false);
```

### Friend management

#### Get friend list

```typescript
const friends = await getFriendList(accountId);
```

#### Delete friend

```typescript
await deleteFriend(accountId, userId);
```

#### Set friend remark

```typescript
await setFriendRemark(accountId, userId, "New Remark");
```

### File management

#### Upload group file

```typescript
await uploadGroupFile(accountId, groupId, "file:///path/to/file.pdf", "folder_id", "file.pdf");
```

#### Upload private file

```typescript
await uploadPrivateFile(accountId, userId, "file:///path/to/file.pdf", "file.pdf");
```

## Event handling

NapCatQQ supports various event types:

### Notice events

- `group_increase` - Group member joined (approve/invite)
- `group_decrease` - Group member left (leave/kick/kick_me)
- `group_admin` - Group admin changed (set/unset)
- `group_recall` - Message recalled in group
- `friend_recall` - Message recalled in private chat
- `friend_add` - New friend added
- `group_ban` - Group member banned/unbanned
- `notify` - Various notifications (poke, lucky_king, honor)

### Request events

- `friend` - Friend request
- `group` - Group request (add/invite)

### Meta events

- `lifecycle` - Connection lifecycle (connect/enable/disable)
- `heartbeat` - Heartbeat status

Events are logged to the console for debugging and monitoring purposes.

## Access control

There are two separate "gates" for QQ groups:

1. **Group access** (`groupPolicy` + `groups`): whether the bot accepts messages from a group at all.
2. **Sender access** (`groupAllowFrom` / per-group `groups["groupId"].allowFrom`): who is allowed to trigger the bot inside that group.

### Private message policy (dmPolicy)

| Value | Description |
|-------|-------------|
| `"open"` | Accept all private messages |
| `"pairing"` | Require pairing authorization (default) |
| `"closed"` | Reject all private messages |

### Group policy (groupPolicy)

| Value | Description |
|-------|-------------|
| `"open"` | Accept messages from all groups |
| `"allowlist"` | Only accept from whitelisted groups (default) |
| `"closed"` | Reject all group messages |

## Group configuration

Configure specific groups with custom settings:

```json
{
  "channels": {
    "napcatqq": {
      "groupPolicy": "allowlist",
      "groupAllowFrom": [123456789],
      "groups": {
        "123456789": {
          "enabled": true,
          "requireMention": true,
          "systemPrompt": "You are a helpful group assistant.",
          "skills": ["weather", "translation"]
        }
      }
    }
  }
}
```

### Group config options

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | boolean | Enable/disable this group |
| `requireMention` | boolean | Require @mention to respond |
| `systemPrompt` | string | Group-specific system prompt |
| `skills` | string[] | Enabled skills for this group |
| `allowFrom` | number[] | Allowed users in this group |
| `tools` | object | Tool policy configuration |

## Multi-account configuration

Configure multiple QQ accounts:

```json
{
  "channels": {
    "napcatqq": {
      "accounts": {
        "bot1": {
          "name": "Primary Bot",
          "wsPort": 3001,
          "wsPath": "/onebot/bot1/ws",
          "accessToken": "token-bot1"
        },
        "bot2": {
          "name": "Secondary Bot",
          "wsPort": 3002,
          "wsPath": "/onebot/bot2/ws",
          "accessToken": "token-bot2"
        }
      }
    }
  }
}
```

Each NapCatQQ instance connects to its corresponding endpoint.

## Message handling

### Supported message types

- Text messages
- @mentions
- Reply messages (quote reply)
- Images (receive only)
- Voice messages (receive only)
- Videos (receive only)
- Files (txt, doc, pdf, etc.)
- Markdown messages
- MiniApp messages
- MFace (商城表情)
- Dice (骰子)
- RPS (猜拳)
- JSON/XML messages
- Location messages

### Sending messages

The bot can send:
- Text messages
- Reply messages (with quote)
- Group messages
- Private messages
- File messages (txt, doc, pdf, etc.)
- Markdown messages
- MiniApp messages
- MFace (商城表情)
- Dice (骰子) - random or specified result
- RPS (猜拳/石头剪刀布) - random or specified result
- JSON/XML structured messages
- Location messages

### File message support

NapCatQQ supports sending various file types:

```json
{
  "type": "file",
  "data": {
    "file": "file:///path/to/document.pdf",
    "name": "document.pdf"
  }
}
```

Supported file types include:
- Text files: `.txt`, `.md`, `.json`, `.csv`
- Documents: `.doc`, `.docx`, `.pdf`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- Archives: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`
- Code files: `.js`, `.ts`, `.py`, `.java`, `.go`, `.rs`
- And other file types supported by QQ

### Extended message types

#### Markdown message

```json
{
  "type": "markdown",
  "data": {
    "content": "# Title\n\n**Bold text** and *italic*"
  }
}
```

#### MiniApp message

```json
{
  "type": "miniapp",
  "data": {
    "data": "<miniapp JSON data>"
  }
}
```

#### MFace (商城表情)

```json
{
  "type": "mface",
  "data": {
    "emoji_package_id": 12345,
    "emoji_id": "abc123",
    "key": "emoji_key",
    "summary": "表情摘要"
  }
}
```

#### Dice (骰子)

```json
{
  "type": "dice",
  "data": {
    "result": 6
  }
}
```

If `result` is omitted, a random value will be generated.

#### RPS (猜拳/石头剪刀布)

```json
{
  "type": "rps",
  "data": {
    "result": 1
  }
}
```

Result values: `1` = 石头, `2` = 剪刀, `3` = 布. If omitted, random.

#### Location message

```json
{
  "type": "location",
  "data": {
    "lat": 39.9042,
    "lon": 116.4074,
    "title": "Beijing",
    "content": "Capital of China"
  }
}
```

#### JSON message

```json
{
  "type": "json",
  "data": {
    "data": "{\"key\": \"value\"}",
    "config": {
      "token": "optional_token"
    }
  }
}
```

#### XML message

```json
{
  "type": "xml",
  "data": {
    "data": "<xml>...</xml>"
  }
}
```

## Configuration reference

```json
{
  "channels": {
    "napcatqq": {
      "enabled": true,
      "name": "My QQ Bot",
      "wsPort": 3001,
      "wsHost": "127.0.0.1",
      "wsPath": "/onebot/v11/ws",
      "accessToken": "your-token",
      "dmPolicy": "pairing",
      "allowFrom": [123456789],
      "groupPolicy": "allowlist",
      "groupAllowFrom": [987654321],
      "groups": {
        "987654321": {
          "enabled": true,
          "requireMention": false,
          "systemPrompt": "Custom prompt",
          "skills": ["skill1", "skill2"],
          "allowFrom": [111111111]
        }
      },
      "historyLimit": 100,
      "textChunkLimit": 2000,
      "mediaMaxMb": 50
    }
  }
}
```

## Pairing flow

When `dmPolicy` is set to `"pairing"`:

1. User sends a private message to the bot
2. Bot checks if user is in `allowFrom` list
3. If not authorized, bot generates a pairing code
4. Bot sends pairing instructions to the user
5. Admin approves the pairing request:
   ```bash
   openclaw pairing approve napcatqq <user_id>
   ```
6. User can now interact with the bot

## Troubleshooting

### NapCatQQ cannot connect

- Check if OpenClaw is running
- Verify the WebSocket port is correct
- Ensure `accessToken` matches on both sides
- Check firewall settings

### Messages not responded to

- Check `dmPolicy` and `groupPolicy` settings
- Verify user/group is in the allowlist
- Check if pairing is required
- Enable debug logging

### Group messages ignored

- Ensure group ID is in `groupAllowFrom`
- Check if group is `enabled: true` in `groups` config
- Verify `requireMention` setting

## Related links

- [OneBot 11 Protocol](https://11.onebot.dev/)
- [NapCatQQ Project](https://github.com/NapNeko/NapCatQQ)
