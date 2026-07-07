import { loadSharedConfig } from "@/lib/shared-config";

type CommunicationRow = {
  message?: string;
  purpose?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const purpose = url.searchParams.get("purpose")?.trim() ?? "";

  if (!purpose) {
    return Response.json(
      { ok: false, error: "A purpose query parameter is required." },
      { status: 400 },
    );
  }

  const config = await loadSharedConfig();
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/communications?select=message,purpose&purpose=eq.${purpose}&limit=1`,
    {
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return Response.json(
      { ok: false, error: "Unable to read the communications row." },
      { status: 502 },
    );
  }

  const rows = (await response.json()) as CommunicationRow[];

  return Response.json({
    ok: true,
    message: rows[0]?.message ?? "",
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    purpose?: string;
  };
  const purpose = body.purpose?.trim() ?? "";
  const message = body.message ?? "";

  if (!purpose) {
    return Response.json(
      { ok: false, error: "A purpose field is required." },
      { status: 400 },
    );
  }

  const config = await loadSharedConfig();
  const queryUrl =
    `${config.supabaseUrl}/rest/v1/communications?select=message,purpose&purpose=eq.${purpose}&limit=1`;
  const headers = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
  };
  const existingRowsResponse = await fetch(queryUrl, {
    headers,
    cache: "no-store",
  });

  if (!existingRowsResponse.ok) {
    return Response.json(
      { ok: false, error: "Unable to check the communications row." },
      { status: 502 },
    );
  }

  const existingRows = (await existingRowsResponse.json()) as CommunicationRow[];

  if (existingRows.length === 0) {
    const insertResponse = await fetch(`${config.supabaseUrl}/rest/v1/communications`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, purpose }),
    });

    if (!insertResponse.ok) {
      return Response.json(
        { ok: false, error: "Unable to insert the communications row." },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, message });
  }

  const updateResponse = await fetch(
    `${config.supabaseUrl}/rest/v1/communications?purpose=eq.${purpose}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ message, purpose }),
    },
  );

  if (!updateResponse.ok) {
    return Response.json(
      { ok: false, error: "Unable to update the communications row." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, message });
}
