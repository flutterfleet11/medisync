import { createHash, randomBytes } from "node:crypto";
import { publicEnv, serverEnv } from "@/lib/env";
import { NEXCONN_MESSAGE_TYPE } from "@/lib/realtime/topics";

// Nexconn Platform (Chat) API — server side only.
// Docs: https://docs.nexconn.ai/platform-chat-api (auth, base-url,
// user/register → access-token issue, message/system/send-private).
const HOSTS: Record<string, [string, string]> = {
  sg: ["api.sg-light-api.com", "api-b.sg-light-api.com"],
  na: ["api.us-light-api.com", "api-b.us-light-api.com"],
  sa: ["api.sau-light-api.com", "api-b.sau-light-api.com"],
};

const SYSTEM_USER_ID = "medisyncsystem";
let systemUserReady = false;

function signedHeaders() {
  const appKey = publicEnv.nexconnAppKey;
  const secret = serverEnv().nexconnAppSecret;
  const nonce = randomBytes(8).toString("hex"); // 16 chars (limit 18)
  const timestamp = Date.now().toString();
  const signature = createHash("sha1").update(secret + nonce + timestamp).digest("hex");
  return {
    "Content-Type": "application/json",
    "App-Key": appKey,
    Nonce: nonce,
    Timestamp: timestamp,
    Signature: signature,
  };
}

interface NexconnResponse<T> {
  code: number;
  msg?: string;
  message?: string;
  result?: T;
  data?: T;
}

async function call<T>(path: string, body: unknown): Promise<T | undefined> {
  const hosts = HOSTS[publicEnv.nexconnRegion] ?? HOSTS.sg;
  let lastError: unknown;
  for (const host of hosts) {
    try {
      const res = await fetch(`https://${host}${path}`, {
        method: "POST",
        headers: signedHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (res.status >= 500) {
        lastError = new Error(`Nexconn ${host} HTTP ${res.status}`);
        continue; // documented failover: switch to the backup domain
      }
      const json = (await res.json()) as NexconnResponse<T>;
      if (!res.ok || json.code !== 0) {
        throw new Error(`Nexconn ${path} failed: HTTP ${res.status} code ${json.code} ${json.msg ?? json.message ?? ""}`);
      }
      return json.result ?? json.data;
    } catch (e) {
      lastError = e;
      if (e instanceof Error && e.message.startsWith("Nexconn ")) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Nexconn request failed");
}

export async function issueNexconnToken(userId: string, name: string): Promise<string> {
  const result = await call<{ accessToken?: string; token?: string }>("/v4/auth/access-token/issue", {
    userId,
    name: name.slice(0, 64) || userId,
  });
  const token = result?.accessToken ?? result?.token;
  if (!token) throw new Error("Nexconn did not return an access token");
  return token;
}

/** Sends a silent MS:Sync signal to up to 100 users per request via the system channel. */
export async function sendNexconnSignal(toUserIds: string[], content: Record<string, unknown>) {
  if (toUserIds.length === 0) return;
  if (!systemUserReady) {
    await issueNexconnToken(SYSTEM_USER_ID, "MediSync");
    systemUserReady = true;
  }
  for (let i = 0; i < toUserIds.length; i += 100) {
    await call("/v4/system-channel/message/send", {
      fromUserId: SYSTEM_USER_ID,
      toUserIds: toUserIds.slice(i, i + 100),
      messageType: NEXCONN_MESSAGE_TYPE,
      content: JSON.stringify(content),
      shouldPersist: 0,
      disablePush: true,
    });
  }
}
