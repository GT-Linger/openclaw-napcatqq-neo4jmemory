export type SlashCommandDef = {
  name: string;
  description: string;
  args?: string;
};

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: "help", description: "Show available commands" },
  { name: "status", description: "Show current status" },
  { name: "reset", description: "Reset session" },
  { name: "compact", description: "Compact session context" },
  { name: "stop", description: "Stop current run" },
  { name: "model", description: "Show/set model", args: "<name>" },
  { name: "think", description: "Set thinking level", args: "<off|low|medium|high>" },
  { name: "verbose", description: "Toggle verbose mode", args: "<on|off|full>" },
  { name: "export", description: "Export session to HTML" },
  { name: "skill", description: "Run a skill", args: "<name>" },
  { name: "agents", description: "List agents" },
  { name: "kill", description: "Abort sub-agents", args: "<id|all>" },
  { name: "steer", description: "Steer a sub-agent", args: "<id> <msg>" },
  { name: "usage", description: "Show token usage" },
];

/**
 * Return slash commands matching a prefix filter (case-insensitive).
 * Empty filter returns all commands.
 */
export function getSlashCommandCompletions(filter: string): SlashCommandDef[] {
  if (!filter) {
    return SLASH_COMMANDS;
  }
  const lower = filter.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(lower));
}
