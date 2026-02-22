import { consume } from "@lit/context";
import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { icon } from "../components/icons.js";
import { gatewayContext, type GatewayState } from "../context/gateway-context.js";
import { loadSkillsStatus } from "../controllers/skills.js";
import type { SkillStatusEntry } from "../types/dashboard.js";

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const custom: SkillStatusEntry[] = [];
  const installed: SkillStatusEntry[] = [];
  for (const s of skills) {
    if (s.bundled) {
      custom.push(s);
    } else {
      installed.push(s);
    }
  }
  return [
    { id: "custom", label: "Custom Skills", skills: custom },
    { id: "installed", label: "Skills", skills: installed },
  ];
}

function skillTags(skill: SkillStatusEntry): string[] {
  const tags: string[] = [];
  const desc = skill.description.toLowerCase();
  const keywords = [
    "research",
    "analysis",
    "code",
    "quality",
    "devops",
    "infrastructure",
    "automation",
    "writing",
    "documentation",
    "content",
    "data",
    "reporting",
    "security",
    "audit",
    "compliance",
    "api",
    "integration",
    "webhooks",
    "management",
    "coordination",
    "planning",
  ];
  for (const kw of keywords) {
    if (desc.includes(kw)) {
      tags.push(kw);
    }
    if (tags.length >= 3) {
      break;
    }
  }
  const toolCount = skill.configChecks.length + skill.install.length;
  if (toolCount > 0) {
    tags.push(`${toolCount} tool${toolCount !== 1 ? "s" : ""}`);
  }
  return tags;
}

@customElement("skills-view")
export class SkillsView extends LitElement {
  @consume({ context: gatewayContext, subscribe: true })
  gateway!: GatewayState;

  override createRenderRoot() {
    return this;
  }

  @state() private skills: SkillStatusEntry[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private filter = "";

  private lastConnectedState: boolean | null = null;

  override updated(): void {
    const connected = this.gateway?.connected ?? false;
    if (connected && this.lastConnectedState !== true) {
      void this.loadSkills();
    }
    this.lastConnectedState = connected;
  }

  private async loadSkills(): Promise<void> {
    if (!this.gateway?.connected || this.loading) {
      return;
    }
    this.loading = true;
    this.error = null;
    try {
      const report = await loadSkillsStatus(this.gateway.request);
      this.skills = report.skills;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  override render() {
    const query = this.filter.trim().toLowerCase();
    const filtered = query
      ? this.skills.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            s.source.toLowerCase().includes(query),
        )
      : this.skills;

    const groups = groupSkills(filtered);

    return html`
      <div class="skills-page">
        ${this.renderToolbar(filtered.length)}
        ${this.error ? html`<div class="error">${this.error}</div>` : nothing}
        ${groups.map((g) => this.renderGroup(g))}
      </div>
    `;
  }

  private renderToolbar(shownCount: number) {
    return html`
      <div class="skills-page__toolbar">
        <div class="skills-page__search">
          ${icon("search", { className: "icon-xs" })}
          <input
            class="skills-page__search-input"
            type="text"
            placeholder="Search skills and tools..."
            .value=${this.filter}
            @input=${(e: Event) => {
              this.filter = (e.target as HTMLInputElement).value;
            }}
          />
        </div>
        <div class="skills-page__toolbar-right">
          <button
            class="skills-page__filter-btn ${this.filter ? "" : "skills-page__filter-btn--active"}"
            @click=${() => {
              this.filter = "";
            }}
          >All</button>
          <span class="muted">${shownCount} shown</span>
          <button
            class="skills-page__refresh-btn"
            @click=${() => void this.loadSkills()}
            ?disabled=${this.loading}
            title="Refresh skills"
          >
            ${this.loading ? icon("loader", { className: "icon-xs icon-spin" }) : icon("refresh", { className: "icon-xs" })}
          </button>
        </div>
      </div>
    `;
  }

  private renderGroup(group: SkillGroup) {
    return html`
      <section class="skills-section">
        <div class="skills-section__header">
          <span class="skills-section__icon">${icon("zap", { className: "icon-xs" })}</span>
          <span class="skills-section__label">${group.label}</span>
          <span class="count-badge">${group.skills.length}</span>
        </div>
        ${
          group.skills.length > 0
            ? html`<div class="skills-card-grid">${group.skills.map((s) => this.renderCard(s))}</div>`
            : this.renderEmpty()
        }
      </section>
    `;
  }

  private renderCard(skill: SkillStatusEntry) {
    const tags = skillTags(skill);
    const badge = skill.bundled ? "Built-in" : skill.source.replace("openclaw-", "");

    return html`
      <div class="skill-card">
        <div class="skill-card__top">
          <span class="skill-card__name">
            ${skill.emoji ? html`<span class="skill-card__emoji">${skill.emoji}</span>` : nothing}
            ${skill.name}
          </span>
          <span class="skill-card__badge">${badge}</span>
          <button
            class="skill-card__edit"
            title="Edit skill"
            @click=${() => {
              if (skill.homepage) {
                window.open(skill.homepage, "_blank", "noreferrer");
              }
            }}
          >
            ${icon("edit", { className: "icon-xs" })}
          </button>
        </div>
        <p class="skill-card__desc">${skill.description}</p>
        ${
          tags.length > 0
            ? html`<div class="skill-card__tags">${tags.map((t) => html`<span class="skill-card__tag">${t}</span>`)}</div>`
            : nothing
        }
      </div>
    `;
  }

  private renderEmpty() {
    return html`
      <div class="skills-empty">
        ${icon("zap", { className: "icon-xl" })}
        <div class="skills-empty__title">No skills available</div>
        <div class="skills-empty__sub">Skills will appear here when installed on your gateway.</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "skills-view": SkillsView;
  }
}
