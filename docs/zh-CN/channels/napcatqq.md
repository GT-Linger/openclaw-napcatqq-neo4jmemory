---
read_when:
  - 你想让 OpenClaw 通过 QQ 平台进行通信
  - 你需要配置 NapCatQQ 渠道
summary: 通过 NapCatQQ 连接 OpenClaw 到 QQ 平台
title: NapCatQQ
---

# NapCatQQ

当你想让 OpenClaw 在 QQ 消息平台上工作时，请使用 NapCatQQ。NapCatQQ 实现了 OneBot 11 协议，允许 OpenClaw 通过 QQ 接收和发送消息。

NapCatQQ 作为扩展插件提供，在主配置的 `channels.napcatqq` 下进行配置。

## 架构

OpenClaw 作为 WebSocket 服务器，NapCatQQ 使用反向 WebSocket 作为客户端连接：

```
┌─────────────────┐         反向 WebSocket          ┌─────────────────┐
│                 │ ◄────────────────────────────── │                 │
│    OpenClaw     │                                 │    NapCatQQ     │
│  (WS 服务器)    │ ──────────────────────────────► │  (WS 客户端)    │
│                 │         API 调用/事件          │                 │
└─────────────────┘                                 └─────────────────┘
     :3001                                                QQ 协议
```

## 快速开始

1. 在 `~/.openclaw/openclaw.json` 中启用 NapCatQQ 配置：

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

2. 配置 NapCatQQ 使用反向 WebSocket：

```json
{
  "reverseWs": {
    "enable": true,
    "urls": ["ws://127.0.0.1:3001/onebot/v11/ws"]
  },
  "accessToken": "your-secure-token"
}
```

3. 启动/重启网关：

```bash
openclaw gateway run
```

## 安全默认设置

- `channels.napcatqq.dmPolicy` 默认为 `"pairing"`。
- `channels.napcatqq.groupPolicy` 默认为 `"allowlist"`。
- 当 `groupPolicy="allowlist"` 时，需设置 `channels.napcatqq.groups` 定义允许的群组。
- 使用 `accessToken` 保护 WebSocket 连接。

## 连接参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `wsPort` | number | 3001 | WebSocket 服务器端口 |
| `wsHost` | string | "127.0.0.1" | WebSocket 服务器主机 |
| `wsPath` | string | "/onebot/v11/ws" | WebSocket 路径 |
| `accessToken` | string | - | 访问令牌用于认证 |

## 高级配置

### 重连设置

配置连接丢失时的自动重连：

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

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `enabled` | boolean | true | 启用重连 |
| `maxRetries` | number | 10 | 最大重试次数 |
| `retryDelay` | number | 5000 | 初始重试延迟（毫秒） |
| `backoffMultiplier` | number | 2 | 指数退避乘数 |
| `maxDelay` | number | 60000 | 最大重试延迟（毫秒） |

### 心跳设置

配置心跳检测以监控连接健康状态：

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

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `enabled` | boolean | true | 启用心跳 |
| `interval` | number | 30000 | 心跳间隔（毫秒） |
| `timeout` | number | 10000 | 请求超时（毫秒） |

## API 函数

### 群管理

#### 设置群管理员

```typescript
await setGroupAdmin(accountId, groupId, userId, true);
```

#### 设置群禁言

```typescript
await setGroupMute(accountId, groupId, userId, 600);
```

#### 踢出群成员

```typescript
await kickGroupMember(accountId, groupId, userId, false);
```

#### 设置全体禁言

```typescript
await setGroupWholeMute(accountId, groupId, true);
```

#### 设置群名称

```typescript
await setGroupName(accountId, groupId, "新群名称");
```

#### 获取群成员信息

```typescript
const memberInfo = await getGroupMemberInfo(accountId, groupId, userId, false);
```

### 好友管理

#### 获取好友列表

```typescript
const friends = await getFriendList(accountId);
```

#### 删除好友

```typescript
await deleteFriend(accountId, userId);
```

#### 设置好友备注

```typescript
await setFriendRemark(accountId, userId, "新备注");
```

### 文件管理

#### 上传群文件

```typescript
await uploadGroupFile(accountId, groupId, "file:///path/to/file.pdf", "folder_id", "file.pdf");
```

#### 上传私聊文件

```typescript
await uploadPrivateFile(accountId, userId, "file:///path/to/file.pdf", "file.pdf");
```

## 事件处理

NapCatQQ 支持多种事件类型：

### 通知事件

- `group_increase` - 群成员加入（approve/invite）
- `group_decrease` - 群成员离开（leave/kick/kick_me）
- `group_admin` - 群管理员变动（set/unset）
- `group_recall` - 群消息撤回
- `friend_recall` - 私聊消息撤回
- `friend_add` - 新好友添加
- `group_ban` - 群成员禁言/解禁
- `notify` - 各种通知（戳一戳、运气王、群荣誉）

### 请求事件

- `friend` - 好友请求
- `group` - 群请求（add/invite）

### 元事件

- `lifecycle` - 连接生命周期（connect/enable/disable）
- `heartbeat` - 心跳状态

事件会记录到控制台以供调试和监控。

## 访问控制

QQ 群有两个独立的"关卡"：

1. **群访问**（`groupPolicy` + `groups`）：机器人是否接受来自某个群的消息。
2. **发送者访问**（`groupAllowFrom` / 每群 `groups["groupId"].allowFrom`）：群内谁被允许触发机器人。

### 私信策略

| 值 | 描述 |
|----|------|
| `"open"` | 接受所有私信 |
| `"pairing"` | 需要配对授权（默认） |
| `"closed"` | 拒绝所有私信 |

### 群策略

| 值 | 描述 |
|----|------|
| `"open"` | 接受所有群的消息 |
| `"allowlist"` | 只接受白名单群的消息（默认） |
| `"closed"` | 拒绝所有群消息 |

## 群配置

为特定群配置自定义设置：

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
          "systemPrompt": "你是一个有用的群助手。",
          "skills": ["weather", "translation"]
        }
      }
    }
  }
}
```

### 群配置选项

| 选项 | 类型 | 描述 |
|------|------|------|
| `enabled` | boolean | 启用/禁用此群 |
| `requireMention` | boolean | 需要 @提及 才响应 |
| `systemPrompt` | string | 群特定的系统提示 |
| `skills` | string[] | 此群启用的技能 |
| `allowFrom` | number[] | 此群允许的用户 |
| `tools` | object | 工具策略配置 |

## 多账号配置

配置多个 QQ 账号：

```json
{
  "channels": {
    "napcatqq": {
      "accounts": {
        "bot1": {
          "name": "主机器人",
          "wsPort": 3001,
          "wsPath": "/onebot/bot1/ws",
          "accessToken": "token-bot1"
        },
        "bot2": {
          "name": "副机器人",
          "wsPort": 3002,
          "wsPath": "/onebot/bot2/ws",
          "accessToken": "token-bot2"
        }
      }
    }
  }
}
```

每个 NapCatQQ 实例连接到其对应的端点。

## 消息处理

### 支持的消息类型

- 文本消息
- @提及
- 回复消息（引用回复）
- 图片（仅接收）
- 语音消息（仅接收）
- 视频消息（仅接收）
- 文件（txt、doc、pdf 等）
- Markdown 消息
- 小程序消息
- MFace（商城表情）
- 骰子
- 猜拳
- JSON/XML 消息
- 位置消息

### 发送消息

机器人可以发送：
- 文本消息
- 回复消息（带引用）
- 群消息
- 私聊消息
- 文件消息（txt、doc、pdf 等）
- Markdown 消息
- 小程序消息
- MFace（商城表情）
- 骰子 - 随机或指定结果
- 猜拳/石头剪刀布 - 随机或指定结果
- JSON/XML 结构化消息
- 位置消息

### 文件消息支持

NapCatQQ 支持发送多种文件类型：

```json
{
  "type": "file",
  "data": {
    "file": "file:///path/to/document.pdf",
    "name": "document.pdf"
  }
}
```

支持的文件类型包括：
- 文本文件：`.txt`、`.md`、`.json`、`.csv`
- 文档：`.doc`、`.docx`、`.pdf`、`.xls`、`.xlsx`、`.ppt`、`.pptx`
- 压缩包：`.zip`、`.rar`、`.7z`、`.tar`、`.gz`
- 代码文件：`.js`、`.ts`、`.py`、`.java`、`.go`、`.rs`
- 以及 QQ 支持的其他文件类型

### 扩展消息类型

#### Markdown 消息

```json
{
  "type": "markdown",
  "data": {
    "content": "# 标题\n\n**粗体** 和 *斜体*"
  }
}
```

#### 小程序消息

```json
{
  "type": "miniapp",
  "data": {
    "data": "<小程序 JSON 数据>"
  }
}
```

#### MFace（商城表情）

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

#### 骰子

```json
{
  "type": "dice",
  "data": {
    "result": 6
  }
}
```

如果省略 `result`，将生成随机值。

#### 猜拳/石头剪刀布

```json
{
  "type": "rps",
  "data": {
    "result": 1
  }
}
```

结果值：`1` = 石头，`2` = 剪刀，`3` = 布。如果省略，则随机。

#### 位置消息

```json
{
  "type": "location",
  "data": {
    "lat": 39.9042,
    "lon": 116.4074,
    "title": "北京",
    "content": "中国首都"
  }
}
```

#### JSON 消息

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

#### XML 消息

```json
{
  "type": "xml",
  "data": {
    "data": "<xml>...</xml>"
  }
}
```

## 配置参考

```json
{
  "channels": {
    "napcatqq": {
      "enabled": true,
      "name": "我的 QQ 机器人",
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
          "systemPrompt": "自定义提示",
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

## 配对流程

当 `dmPolicy` 设置为 `"pairing"` 时：

1. 用户向机器人发送私信
2. 机器人检查用户是否在 `allowFrom` 列表中
3. 如果未授权，机器人生成配对码
4. 机器人向用户发送配对说明
5. 管理员批准配对请求：
   ```bash
   openclaw pairing approve napcatqq <user_id>
   ```
6. 用户现在可以与机器人交互

## 故障排除

### NapCatQQ 无法连接

- 检查 OpenClaw 是否正在运行
- 验证 WebSocket 端口是否正确
- 确保 `accessToken` 两边匹配
- 检查防火墙设置

### 消息无响应

- 检查 `dmPolicy` 和 `groupPolicy` 设置
- 验证用户/群是否在白名单中
- 检查是否需要配对
- 启用调试日志

### 群消息被忽略

- 确保群 ID 在 `groupAllowFrom` 中
- 检查群是否在 `groups` 配置中 `enabled: true`
- 验证 `requireMention` 设置

## 相关链接

- [OneBot 11 协议](https://11.onebot.dev/)
- [NapCatQQ 项目](https://github.com/NapNeko/NapCatQQ)
