export async function GET() {
  return Response.json(
    {
      ok: false,
      error: "Parameter-file payloads are read from Supabase daemon_payloads.",
    },
    { status: 410 },
  );
}

export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "Daemon parameter-file payloads are written to Supabase daemon_payloads.",
    },
    { status: 410 },
  );
}

export async function PATCH() {
  return Response.json(
    {
      ok: false,
      error: "Parameter edits are sent to the local daemon through Supabase.",
    },
    { status: 410 },
  );
}
