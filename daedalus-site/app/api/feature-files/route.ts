import { getCachedProjects, setCachedProjects } from "@/lib/feature-file-cache";

export async function GET() {
  return Response.json({
    projects: getCachedProjects(),
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

  setCachedProjects(body.projects);

  return Response.json({ ok: true });
}
