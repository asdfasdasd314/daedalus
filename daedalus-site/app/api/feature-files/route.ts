export async function GET() {
  return Response.json(
    {
      ok: false,
      error: "Feature-file payloads are read from Supabase daemon_payloads.",
    },
    { status: 410 },
  );
}

export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "Daemon feature-file payloads are written to Supabase daemon_payloads.",
    },
    { status: 410 },
  );
}
