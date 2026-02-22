import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { NapCatQQRuntimeState } from "./types.js";

let runtime: PluginRuntime | null = null;

export function setNapCatQQRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getNapCatQQRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("NapCatQQ runtime not initialized");
  }
  return runtime;
}

const accountStates = new Map<string, NapCatQQRuntimeState>();

export function getNapCatQQAccountState(accountId: string): NapCatQQRuntimeState | undefined {
  return accountStates.get(accountId);
}

export function setNapCatQQAccountState(accountId: string, state: NapCatQQRuntimeState): void {
  accountStates.set(accountId, state);
}

export function updateNapCatQQAccountState(
  accountId: string,
  patch: Partial<NapCatQQRuntimeState>,
): void {
  const current = accountStates.get(accountId);
  if (current) {
    accountStates.set(accountId, { ...current, ...patch });
  }
}
