export async function GET() {
  return Response.json(
    {
      ok: false,
      error: "Communications are read directly from Supabase with an authenticated session.",
    },
    { status: 410 },
  );
}

export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "Communications are written directly to Supabase with an authenticated session.",
    },
    { status: 410 },
  );
}
