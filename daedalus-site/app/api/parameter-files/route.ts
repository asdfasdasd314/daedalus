import {
  getCachedProjects,
  setCachedProjects,
  type ParameterFileProjects,
} from "@/lib/parameter-file-cache";
import { updateParameterVariableInToml } from "@/lib/parameter-file-parser";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

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

  setCachedProjects(body.projects as ParameterFileProjects);

  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    path?: string;
    projectPath?: string;
    value?: string;
    variableName?: string;
  };

  if (
    !body.projectPath ||
    !body.path ||
    !body.variableName ||
    typeof body.value !== "string"
  ) {
    return Response.json(
      { ok: false, error: "projectPath, path, variableName, and value are required." },
      { status: 400 },
    );
  }

  if (!body.path.startsWith("parameter_files/") || !body.path.endsWith(".toml")) {
    return Response.json(
      { ok: false, error: "Only parameter_files/*.toml can be edited here." },
      { status: 400 },
    );
  }

  const projectRoot = resolve(body.projectPath);
  const absolutePath = resolve(projectRoot, body.path);

  if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${sep}`)) {
    return Response.json(
      { ok: false, error: "Parameter file path must stay inside the selected project." },
      { status: 400 },
    );
  }

  try {
    const currentToml = await readFile(absolutePath, "utf-8");
    const updatedToml = updateParameterVariableInToml(
      currentToml,
      body.variableName,
      body.value,
    );

    if (!updatedToml.ok) {
      return Response.json(
        { ok: false, error: updatedToml.error },
        { status: 400 },
      );
    }

    await writeFile(absolutePath, updatedToml.toml, "utf-8");

    const cachedProjects = getCachedProjects();

    if (cachedProjects) {
      const nextProjects: ParameterFileProjects = { ...cachedProjects };
      const currentProjectFiles = nextProjects[body.projectPath] ?? [];
      let didUpdateRecord = false;

      nextProjects[body.projectPath] = currentProjectFiles.map((record) => {
        if (record.path !== body.path) {
          return record;
        }

        didUpdateRecord = true;
        return {
          ...record,
          toml: updatedToml.toml,
        };
      });

      if (!didUpdateRecord) {
        nextProjects[body.projectPath] = [
          ...nextProjects[body.projectPath],
          {
            path: body.path,
            toml: updatedToml.toml,
          },
        ];
      }

      setCachedProjects(nextProjects);
    }

    return Response.json({
      ok: true,
      record: {
        path: body.path,
        toml: updatedToml.toml,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update parameter file.",
      },
      { status: 500 },
    );
  }
}
