import {
  getCachedExchange,
  setCachedExchange,
  type AgentChatExchange,
} from "@/lib/agent-chat-cache";

export async function GET() {
  return Response.json({
    chat: getCachedExchange(),
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.source !== "daemon") {
    return Response.json(
      { ok: false, error: "Only daemon payloads are accepted." },
      { status: 400 },
    );
  }

  setCachedExchange(body as AgentChatExchange);

  return Response.json({ ok: true });
}
