import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isNexconnConfigured } from "@/lib/env";
import { issueNexconnToken } from "@/lib/realtime/nexconn-server";
import { nexconnUserId } from "@/lib/realtime/topics";

// Issues a Nexconn access token for the signed-in user (server holds the App
// Secret). The browser uses it to receive MS:Sync realtime signals.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isNexconnConfigured()) return NextResponse.json({ error: "Nexconn not configured" }, { status: 503 });
  try {
    const token = await issueNexconnToken(nexconnUserId(session.userId), session.profile.full_name);
    return NextResponse.json({ token }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[nexconn] token issue failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Nexconn token issue failed" }, { status: 502 });
  }
}
