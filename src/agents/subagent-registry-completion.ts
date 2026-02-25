import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import type { SubagentRunOutcome } from "./subagent-announce.js";
import { getSubagentById } from "./subagent-manager.js";
import { stopSubagentModelService } from "./model-service-integration.js";
import { releaseModelSlot, removeFromWaitingQueue, getModelKey, subtractMemoryUsage } from "./subagent-concurrency.js";
import {
  SUBAGENT_ENDED_OUTCOME_ERROR,
  SUBAGENT_ENDED_OUTCOME_OK,
  SUBAGENT_ENDED_OUTCOME_TIMEOUT,
  SUBAGENT_TARGET_KIND_SUBAGENT,
  type SubagentLifecycleEndedOutcome,
  type SubagentLifecycleEndedReason,
} from "./subagent-lifecycle-events.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export function runOutcomesEqual(
  a: SubagentRunOutcome | undefined,
  b: SubagentRunOutcome | undefined,
): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.status !== b.status) {
    return false;
  }
  if (a.status === "error" && b.status === "error") {
    return (a.error ?? "") === (b.error ?? "");
  }
  return true;
}

export function resolveLifecycleOutcomeFromRunOutcome(
  outcome: SubagentRunOutcome | undefined,
): SubagentLifecycleEndedOutcome {
  if (outcome?.status === "error") {
    return SUBAGENT_ENDED_OUTCOME_ERROR;
  }
  if (outcome?.status === "timeout") {
    return SUBAGENT_ENDED_OUTCOME_TIMEOUT;
  }
  return SUBAGENT_ENDED_OUTCOME_OK;
}

export async function emitSubagentEndedHookOnce(params: {
  entry: SubagentRunRecord;
  reason: SubagentLifecycleEndedReason;
  sendFarewell?: boolean;
  accountId?: string;
  outcome?: SubagentLifecycleEndedOutcome;
  error?: string;
  inFlightRunIds: Set<string>;
  persist: () => void;
}) {
  const runId = params.entry.runId.trim();
  if (!runId) {
    return false;
  }
  if (params.entry.endedHookEmittedAt) {
    return false;
  }
  if (params.inFlightRunIds.has(runId)) {
    return false;
  }

  params.inFlightRunIds.add(runId);
  try {
    const hookRunner = getGlobalHookRunner();
    if (hookRunner?.hasHooks("subagent_ended")) {
      await hookRunner.runSubagentEnded(
        {
          targetSessionKey: params.entry.childSessionKey,
          targetKind: SUBAGENT_TARGET_KIND_SUBAGENT,
          reason: params.reason,
          sendFarewell: params.sendFarewell,
          accountId: params.accountId,
          runId: params.entry.runId,
          endedAt: params.entry.endedAt,
          outcome: params.outcome,
          error: params.error,
        },
        {
          runId: params.entry.runId,
          childSessionKey: params.entry.childSessionKey,
          requesterSessionKey: params.entry.requesterSessionKey,
        },
      );
    }

    const agentIdMatch = params.entry.childSessionKey.match(/^agent:([^:]+):/);
    if (agentIdMatch) {
      const agentId = agentIdMatch[1];
      const subagentConfig = getSubagentById(agentId);
      if (subagentConfig) {
        const endpoint = subagentConfig.model.endpoint;
        const behavior = subagentConfig.behavior ?? {};
        const endpointWithModel = {
          provider: endpoint.provider,
          baseUrl: endpoint.baseUrl,
          model: endpoint.model,
        };
        const gpuMemoryUtilization = behavior.gpuMemoryUtilization ?? 0.9;

        releaseModelSlot(agentId, endpointWithModel, params.entry.requesterSessionKey);
        removeFromWaitingQueue(params.entry.runId, params.entry.requesterSessionKey);
        subtractMemoryUsage(agentId, endpointWithModel, gpuMemoryUtilization);

        stopSubagentModelService(params.entry.runId, subagentConfig).catch((err) => {
          console.error(`[SubagentCompletion] Failed to stop model service for subagent ${agentId}:`, err);
        });
      }
    }

    params.entry.endedHookEmittedAt = Date.now();
    params.persist();
    return true;
  } catch {
    return false;
  } finally {
    params.inFlightRunIds.delete(runId);
  }
}
