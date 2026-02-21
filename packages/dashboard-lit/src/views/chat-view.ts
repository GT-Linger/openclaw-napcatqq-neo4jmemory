import { consume } from "@lit/context";
import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { icon } from "../components/icons.js";
import { gatewayContext, type GatewayState } from "../context/gateway-context.js";
import { loadAgents, type AgentInfo } from "../controllers/agents.js";
import {
  loadHistory,
  sendMessage,
  abortRun,
  extractText,
  extractThinking,
  extractToolUses,
  extractToolResults,
  formatSessionName,
  type ChatMessage,
  type ChatAttachment,
} from "../controllers/chat.js";
import { loadSessions, type SessionSummary } from "../controllers/sessions.js";
import { renderMarkdown } from "../lib/markdown.js";
import { getSlashCommandCompletions, type SlashCommandDef } from "../lib/slash-commands.js";
import { friendlyToolName } from "../lib/tool-labels.js";

type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  seq?: number;
  state?: "delta" | "final" | "aborted" | "error";
  message?: {
    role: "assistant";
    content: Array<{ type: string; text?: string }>;
    timestamp?: number;
  };
  errorMessage?: string;
};

@customElement("chat-view")
export class ChatView extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @consume({ context: gatewayContext, subscribe: true })
  gateway!: GatewayState;

  @state() sessionKey = "agent:main:main";
  @state() sessions: SessionSummary[] = [];
  @state() messages: ChatMessage[] = [];
  @state() streamingText = "";
  @state() streamingRunId: string | null = null;
  @state() message = "";
  @state() submitting = false;
  @state() loading = false;
  @state() errorText = "";
  @state() expandedTools = new Set<string>();
  @state() expandedThinking = new Set<number>();
  @state() slashMenuOpen = false;
  @state() slashMenuItems: SlashCommandDef[] = [];
  @state() slashMenuIndex = 0;
  @state() attachments: ChatAttachment[] = [];
  @state() agents: AgentInfo[] = [];
  @state() activeAgentId = "main";

  private prevEventSeq = -1;
  private scrollEl: HTMLElement | null = null;
  private shouldAutoScroll = true;

  /* ── Lifecycle ─────────────────────────────────────── */

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadData();
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);

    if (!this.scrollEl) {
      this.scrollEl = this.querySelector(".chat-thread");
    }

    this.handleChatEvent();

    if (changed.has("messages") || changed.has("streamingText")) {
      this.autoScroll();
    }
  }

  /* ── Data loading ──────────────────────────────────── */

  private async loadData(): Promise<void> {
    if (!this.gateway?.connected) {
      return;
    }
    this.loading = true;
    try {
      const [sessionsResult, historyResult, agentsResult] = await Promise.all([
        loadSessions(this.gateway.request, { limit: 100 }),
        loadHistory(this.gateway.request, this.sessionKey),
        loadAgents(this.gateway.request).catch(() => ({ defaultId: "main", agents: [] })),
      ]);
      this.sessions = sessionsResult.sessions;
      this.messages = historyResult.messages;
      this.agents = agentsResult.agents;
      if (agentsResult.defaultId) {
        this.activeAgentId = agentsResult.defaultId;
      }
      this.errorText = "";
    } catch (err) {
      this.errorText = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  private async switchSession(key: string): Promise<void> {
    this.sessionKey = key;
    this.messages = [];
    this.streamingText = "";
    this.streamingRunId = null;
    this.expandedTools = new Set();
    this.expandedThinking = new Set();
    this.attachments = [];
    this.prevEventSeq = -1;

    if (!this.gateway?.connected) {
      return;
    }
    this.loading = true;
    try {
      const result = await loadHistory(this.gateway.request, key);
      this.messages = result.messages;
      this.errorText = "";
    } catch (err) {
      this.errorText = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  /* ── Chat event handling ───────────────────────────── */

  private handleChatEvent(): void {
    const ev = this.gateway?.lastEvent;
    if (!ev || ev.event !== "chat") {
      return;
    }

    const payload = ev.payload as ChatEventPayload | undefined;
    if (!payload || payload.sessionKey !== this.sessionKey) {
      return;
    }

    const seq = payload.seq ?? -1;
    if (seq <= this.prevEventSeq) {
      return;
    }
    this.prevEventSeq = seq;

    switch (payload.state) {
      case "delta": {
        this.streamingRunId = payload.runId ?? null;
        const deltaText =
          payload.message?.content
            ?.filter((b) => b.type === "text" && b.text)
            .map((b) => b.text)
            .join("") ?? "";
        this.streamingText = deltaText;
        break;
      }
      case "final": {
        const finalText =
          payload.message?.content
            ?.filter((b) => b.type === "text" && b.text)
            .map((b) => b.text)
            .join("") ?? "";

        if (finalText) {
          this.messages = [
            ...this.messages,
            {
              role: "assistant",
              content: finalText,
              timestamp: payload.message?.timestamp ?? Date.now(),
            },
          ];
        }
        this.streamingText = "";
        this.streamingRunId = null;
        this.submitting = false;
        break;
      }
      case "error": {
        this.errorText = payload.errorMessage ?? "Unknown error";
        this.streamingText = "";
        this.streamingRunId = null;
        this.submitting = false;
        break;
      }
      case "aborted": {
        this.streamingText = "";
        this.streamingRunId = null;
        this.submitting = false;
        break;
      }
    }
  }

  /* ── Send / Abort ──────────────────────────────────── */

  private async onSend(): Promise<void> {
    const trimmed = this.message.trim();
    if (
      (!trimmed && this.attachments.length === 0) ||
      this.submitting ||
      !this.gateway?.connected
    ) {
      return;
    }

    this.submitting = true;
    this.errorText = "";

    const pendingAttachments = [...this.attachments];
    this.messages = [...this.messages, { role: "user", content: trimmed, timestamp: Date.now() }];
    this.message = "";
    this.attachments = [];

    try {
      const result = await sendMessage(
        this.gateway.request,
        this.sessionKey,
        trimmed,
        pendingAttachments.length > 0 ? pendingAttachments : undefined,
      );
      if (result.status === "error") {
        this.errorText = result.summary ?? "Send failed";
        this.submitting = false;
      } else {
        this.streamingRunId = result.runId;
      }
    } catch (err) {
      this.errorText = err instanceof Error ? err.message : String(err);
      this.submitting = false;
    }
  }

  private async onAbort(): Promise<void> {
    if (!this.gateway?.connected) {
      return;
    }
    try {
      await abortRun(this.gateway.request, this.sessionKey, this.streamingRunId ?? undefined);
    } catch {
      // best-effort
    }
  }

  /* ── Input handling ────────────────────────────────── */

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.slashMenuOpen && this.slashMenuItems.length > 0) {
      const len = this.slashMenuItems.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          this.slashMenuIndex = (this.slashMenuIndex + 1) % len;
          return;
        case "ArrowUp":
          e.preventDefault();
          this.slashMenuIndex = (this.slashMenuIndex - 1 + len) % len;
          return;
        case "Enter":
        case "Tab":
          e.preventDefault();
          this.selectSlashCommand(this.slashMenuItems[this.slashMenuIndex]);
          return;
        case "Escape":
          e.preventDefault();
          this.slashMenuOpen = false;
          return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void this.onSend();
    }
  };

  private handleInput = (e: Event): void => {
    const ta = e.target as HTMLTextAreaElement;
    this.message = ta.value;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
    this.updateSlashMenu(ta.value);
  };

  private updateSlashMenu(value: string): void {
    // Only trigger when the message starts with "/" and has no spaces yet (still typing command name)
    const match = value.match(/^\/(\S*)$/);
    if (match) {
      const filter = match[1];
      const items = getSlashCommandCompletions(filter);
      this.slashMenuItems = items;
      this.slashMenuOpen = items.length > 0;
      this.slashMenuIndex = 0;
    } else {
      this.slashMenuOpen = false;
      this.slashMenuItems = [];
    }
  }

  private selectSlashCommand(cmd: SlashCommandDef): void {
    this.message = `/${cmd.name} `;
    this.slashMenuOpen = false;
    this.slashMenuItems = [];
    // Refocus textarea and place cursor at end
    requestAnimationFrame(() => {
      const ta = this.querySelector<HTMLTextAreaElement>(".chat-input-bar textarea");
      if (ta) {
        ta.value = this.message;
        ta.focus();
        ta.setSelectionRange(this.message.length, this.message.length);
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
      }
    });
  }

  private handleSessionChange = (e: Event): void => {
    const key = (e.target as HTMLSelectElement).value;
    void this.switchSession(key);
  };

  /* ── Attachments ────────────────────────────────────── */

  private handlePaste = (e: ClipboardEvent): void => {
    const items = e.clipboardData?.items;
    if (!items) {
      return;
    }
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          this.readFileAsAttachment(file);
        }
      }
    }
  };

  private handleFileSelect = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) {
      return;
    }
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        this.readFileAsAttachment(file);
      }
    }
    input.value = "";
  };

  private readFileAsAttachment(file: File): void {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      if (base64) {
        this.attachments = [
          ...this.attachments,
          { mimeType: file.type, fileName: file.name, content: base64 },
        ];
      }
    });
    reader.readAsDataURL(file);
  }

  private removeAttachment(index: number): void {
    this.attachments = this.attachments.filter((_, i) => i !== index);
  }

  private triggerFileInput(): void {
    const input = this.querySelector<HTMLInputElement>(".chat-file-input");
    input?.click();
  }

  /* ── Agent picker ───────────────────────────────────── */

  private switchAgent(agentId: string): void {
    this.activeAgentId = agentId;
    const newKey = `agent:${agentId}:main`;
    void this.switchSession(newKey);
  }

  private getAgentDisplayName(agent: AgentInfo): string {
    return agent.identity?.name ?? agent.name ?? agent.id;
  }

  private getAgentEmoji(agent: AgentInfo): string {
    return agent.identity?.emoji ?? "";
  }

  /** Sessions filtered to the active agent. */
  private get filteredSessions(): SessionSummary[] {
    if (this.agents.length <= 1) {
      return this.sessions;
    }
    const prefix = `agent:${this.activeAgentId}:`;
    return this.sessions.filter(
      (s) => s.key.startsWith(prefix) || s.agentId === this.activeAgentId,
    );
  }

  private get activeAgentDisplayName(): string {
    const agent = this.agents.find((a) => a.id === this.activeAgentId);
    if (agent) {
      return this.getAgentDisplayName(agent);
    }
    return formatSessionName(this.sessionKey);
  }

  /* ── Scrolling ─────────────────────────────────────── */

  private autoScroll(): void {
    if (!this.shouldAutoScroll || !this.scrollEl) {
      return;
    }
    requestAnimationFrame(() => {
      if (this.scrollEl) {
        this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
      }
    });
  }

  private handleScroll = (): void => {
    if (!this.scrollEl) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = this.scrollEl;
    this.shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 60;
  };

  /* ── Toggle helpers ────────────────────────────────── */

  private toggleTool(id: string): void {
    const next = new Set(this.expandedTools);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedTools = next;
  }

  private toggleThinking(idx: number): void {
    const next = new Set(this.expandedThinking);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    this.expandedThinking = next;
  }

  /* ── Message rendering ─────────────────────────────── */

  private renderMessage(msg: ChatMessage, idx: number) {
    const text = extractText(msg);
    const ts = msg.timestamp
      ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

    if (msg.role === "user") {
      return html`
        <div class="chat-msg chat-msg--user">
          <div class="chat-msg-header">
            <span class="chat-msg-role chat-msg-role--user">You</span>
            ${ts ? html`<span class="chat-msg-timestamp">${ts}</span>` : nothing}
          </div>
          <div class="chat-msg-text">${text}</div>
        </div>
      `;
    }

    if (msg.role === "assistant") {
      const thinkingBlocks = extractThinking(msg);
      const toolUses = extractToolUses(msg);

      return html`
        <div class="chat-msg chat-msg--assistant">
          <div class="chat-msg-header">
            <span class="chat-msg-role chat-msg-role--assistant">Assistant</span>
            ${ts ? html`<span class="chat-msg-timestamp">${ts}</span>` : nothing}
          </div>
          ${thinkingBlocks.map((thinking, ti) => {
            const wordCount = thinking.split(/\s+/).filter(Boolean).length;
            const thinkKey = idx * 1000 + ti;
            const isOpen = this.expandedThinking.has(thinkKey);
            return html`
              <div class="chat-thinking ${isOpen ? "chat-thinking--open" : ""}">
                <button
                  class="chat-thinking__toggle"
                  @click=${() => this.toggleThinking(thinkKey)}
                >
                  ${icon("brain", { className: "icon-xs" })}
                  Reasoned
                  <span>${wordCount} words</span>
                  ${icon(isOpen ? "chevronUp" : "chevronDown", { className: "icon-xs" })}
                </button>
                <div class="chat-thinking__content">${thinking}</div>
              </div>
            `;
          })}
          ${text ? html`<div class="chat-msg-text chat-markdown">${unsafeHTML(renderMarkdown(text))}</div>` : nothing}
          ${toolUses.map((tu) => this.renderToolUse(tu))}
        </div>
      `;
    }

    // Tool result
    const toolResults = extractToolResults(msg);
    const toolName = msg.toolName ?? "Tool";
    const friendly = friendlyToolName(toolName);

    if (toolResults.length > 0) {
      return html`
        ${toolResults.map((tr) => {
          const chars = tr.content.length;
          const id = tr.toolUseId;
          const isOpen = this.expandedTools.has(id);
          return html`
            <div class="chat-msg chat-msg--tool">
              <div class="chat-tool-card ${isOpen ? "chat-tool-card--open" : ""}">
                <div class="chat-tool-card__header" @click=${() => this.toggleTool(id)}>
                  <span class="chat-tool-card__name">
                    ${icon("terminal", { className: "icon-xs" })}
                    ${friendly}
                  </span>
                  <span style="display: inline-flex; align-items: center; gap: 6px">
                    <span class="chat-tool-card__badge">${chars} chars</span>
                    <span class="chat-tool-card__chevron">
                      ${icon("chevronDown", { className: "icon-xs" })}
                    </span>
                  </span>
                </div>
                <div class="chat-tool-card__body">
                  <pre class="chat-tool-card__output">${tr.content}</pre>
                </div>
              </div>
            </div>
          `;
        })}
      `;
    }

    // Fallback for plain tool messages
    return html`
      <div class="chat-msg chat-msg--tool">
        <div class="chat-msg-header">
          <span class="chat-msg-role chat-msg-role--tool">
            ${icon("terminal", { className: "icon-xs" })} ${friendly}
          </span>
          ${ts ? html`<span class="chat-msg-timestamp">${ts}</span>` : nothing}
        </div>
        ${text ? html`<div class="chat-msg-text" style="color: var(--muted)">${text}</div>` : nothing}
      </div>
    `;
  }

  private renderToolUse(tu: { id: string; name: string; input: unknown }) {
    const isOpen = this.expandedTools.has(tu.id);
    const inputStr = typeof tu.input === "string" ? tu.input : JSON.stringify(tu.input, null, 2);
    const chars = inputStr.length;
    const friendly = friendlyToolName(tu.name);

    return html`
      <div class="chat-tool-card ${isOpen ? "chat-tool-card--open" : ""}" style="margin-top: 6px">
        <div class="chat-tool-card__header" @click=${() => this.toggleTool(tu.id)}>
          <span class="chat-tool-card__name">
            ${icon("zap", { className: "icon-xs" })}
            ${friendly}
          </span>
          <span style="display: inline-flex; align-items: center; gap: 6px">
            <span class="chat-tool-card__badge">${chars} chars</span>
            <span class="chat-tool-card__chevron">
              ${icon("chevronDown", { className: "icon-xs" })}
            </span>
          </span>
        </div>
        <div class="chat-tool-card__body">
          <pre class="chat-tool-card__output">${inputStr}</pre>
        </div>
      </div>
    `;
  }

  /* ── Main render ───────────────────────────────────── */

  override render() {
    const g = this.gateway;
    if (!g) {
      return html`
        <div class="chat-layout"><div class="chat-empty">Connecting...</div></div>
      `;
    }

    const isStreaming = this.streamingRunId !== null;

    return html`
      <div class="chat-layout">
        <!-- Agent pills -->
        ${
          this.agents.length > 1
            ? html`
              <div class="chat-agent-picker">
                ${this.agents.map(
                  (agent) => html`
                    <button
                      class="chat-agent-pill ${agent.id === this.activeAgentId ? "chat-agent-pill--active" : ""}"
                      @click=${() => this.switchAgent(agent.id)}
                      title=${this.getAgentDisplayName(agent)}
                    >
                      ${this.getAgentEmoji(agent) ? html`<span class="chat-agent-emoji">${this.getAgentEmoji(agent)}</span>` : nothing}
                      ${this.getAgentDisplayName(agent)}
                    </button>
                  `,
                )}
              </div>
            `
            : nothing
        }

        <!-- Session header -->
        <div class="chat-session-header">
          <span class="chat-session-name">
            ${icon("messageSquare", { className: "icon-sm" })}
            ${this.activeAgentDisplayName}
          </span>
          <div class="chat-session-controls">
            ${
              this.filteredSessions.length > 0
                ? html`
                  <select
                    class="chat-session-select"
                    .value=${this.sessionKey}
                    @change=${this.handleSessionChange}
                  >
                    ${this.filteredSessions.map(
                      (s) => html`
                        <option value=${s.key} ?selected=${s.key === this.sessionKey}>
                          ${formatSessionName(s.key)}
                        </option>
                      `,
                    )}
                  </select>
                `
                : nothing
            }
            ${
              isStreaming
                ? html`
                  <button
                    class="chat-send-btn chat-send-btn--stop"
                    @click=${() => void this.onAbort()}
                    title="Stop generation"
                  >
                    ${icon("stop", { className: "icon-sm" })}
                  </button>
                `
                : html`
                  <button
                    class="btn-ghost"
                    @click=${() => void this.loadData()}
                    title="Refresh"
                    ?disabled=${this.loading}
                  >
                    ${icon("refresh", { className: "icon-xs" })}
                  </button>
                `
            }
          </div>
        </div>

        <!-- Message thread -->
        <div class="chat-thread" @scroll=${this.handleScroll}>
          ${
            this.loading && this.messages.length === 0
              ? html`
                  <div class="chat-empty">Loading history...</div>
                `
              : nothing
          }

          ${
            this.messages.length === 0 && !this.loading
              ? html`
                  <div class="chat-empty">No messages yet. Send a message to get started.</div>
                `
              : nothing
          }

          ${this.messages.map((msg, i) => this.renderMessage(msg, i))}

          ${
            isStreaming && this.streamingText
              ? html`
                <div class="chat-msg chat-msg--assistant chat-streaming">
                  <div class="chat-msg-header">
                    <span class="chat-msg-role chat-msg-role--assistant">Assistant</span>
                  </div>
                  <div class="chat-msg-text chat-markdown">${unsafeHTML(renderMarkdown(this.streamingText))}</div>
                </div>
              `
              : nothing
          }

          ${
            isStreaming && !this.streamingText
              ? html`
                  <div class="chat-streaming-dots"><span></span><span></span><span></span></div>
                `
              : nothing
          }

          ${this.errorText ? html`<div class="chat-msg-error">${this.errorText}</div>` : nothing}
        </div>

        <!-- Input bar -->
        <div class="chat-input-bar">
          ${
            this.slashMenuOpen && this.slashMenuItems.length > 0
              ? html`
                <div class="slash-menu">
                  ${this.slashMenuItems.map(
                    (cmd, i) => html`
                      <div
                        class="slash-menu-item ${i === this.slashMenuIndex ? "slash-menu-item--active" : ""}"
                        @click=${() => this.selectSlashCommand(cmd)}
                        @mouseenter=${() => {
                          this.slashMenuIndex = i;
                        }}
                      >
                        <span class="slash-menu-name">/${cmd.name}</span>
                        ${cmd.args ? html`<span class="slash-menu-args">${cmd.args}</span>` : nothing}
                        <span class="slash-menu-desc">${cmd.description}</span>
                      </div>
                    `,
                  )}
                </div>
              `
              : nothing
          }
          ${
            this.attachments.length > 0
              ? html`
                <div class="chat-attachments-preview">
                  ${this.attachments.map(
                    (att, i) => html`
                      <div class="chat-attachment-thumb">
                        <img src="data:${att.mimeType};base64,${att.content}" alt=${att.fileName} />
                        <button
                          class="chat-attachment-remove"
                          @click=${() => this.removeAttachment(i)}
                          title="Remove"
                        >&times;</button>
                      </div>
                    `,
                  )}
                </div>
              `
              : nothing
          }
          <input
            type="file"
            accept="image/*"
            multiple
            class="chat-file-input"
            style="display:none"
            @change=${this.handleFileSelect}
          />
          <div class="chat-input-row">
            <button
              class="chat-attach-btn"
              @click=${() => this.triggerFileInput()}
              title="Attach image"
              ?disabled=${!g.connected}
            >
              ${icon("paperclip", { className: "icon-sm" })}
            </button>
            <textarea
              .value=${this.message}
              @input=${this.handleInput}
              @keydown=${this.handleKeyDown}
              @paste=${this.handlePaste}
              placeholder="Type a message (Enter to send, Shift+Enter for newline)"
              rows="1"
              ?disabled=${!g.connected}
            ></textarea>
            ${
              isStreaming
                ? html`
                  <button
                    class="chat-send-btn chat-send-btn--stop"
                    @click=${() => void this.onAbort()}
                    title="Stop"
                  >
                    ${icon("stop")}
                  </button>
                `
                : html`
                  <button
                    class="chat-send-btn"
                    @click=${() => void this.onSend()}
                    ?disabled=${this.submitting || !g.connected || (!this.message.trim() && this.attachments.length === 0)}
                    title="Send"
                  >
                    ${icon("send")}
                  </button>
                `
            }
          </div>
        </div>
      </div>
    `;
  }
}
