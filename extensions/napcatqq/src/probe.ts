import type { CoreConfig, NapCatQQProbe } from "./types.js";
import { resolveNapCatQQAccount } from "./accounts.js";
import { isNapCatQQConnected, getLoginInfo } from "./websocket.js";

export async function probeNapCatQQ(
  cfg: CoreConfig,
  params: { accountId?: string; timeoutMs?: number },
): Promise<NapCatQQProbe> {
  const { accountId } = params;
  const account = resolveNapCatQQAccount({ cfg, accountId });

  if (!isNapCatQQConnected(account.accountId)) {
    return {
      ok: false,
      error: "Not connected - waiting for NapCatQQ to connect",
    };
  }

  try {
    const response = await getLoginInfo(account.accountId);
    if (response.status === "ok" && response.data) {
      return {
        ok: true,
        selfId: response.data.user_id,
        nickname: response.data.nickname,
        online: true,
      };
    }
    return {
      ok: false,
      error: response.message || "Failed to get login info",
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err),
    };
  }
}
