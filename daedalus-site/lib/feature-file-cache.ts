export type FeatureFileProjects = Record<string, string[]>;

let cachedProjects: FeatureFileProjects | null = null;

export function getCachedProjects() {
  return cachedProjects;
}

export function setCachedProjects(projects: FeatureFileProjects) {
  cachedProjects = projects;
}
