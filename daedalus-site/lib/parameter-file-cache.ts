export type ParameterFileRecord = {
  path: string;
  toml: string;
};

export type ParameterFileProjects = Record<string, ParameterFileRecord[]>;

let cachedProjects: ParameterFileProjects | null = null;

export function getCachedProjects() {
  return cachedProjects;
}

export function setCachedProjects(projects: ParameterFileProjects) {
  cachedProjects = projects;
}
