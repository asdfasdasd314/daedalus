export type FeatureFileRecord = {
  path: string;
  markdown: string;
  display_heading?: string;
  byte_size?: number;
  omitted?: boolean;
};

export type FeatureFileProjects = Record<string, FeatureFileRecord[]>;

let cachedProjects: FeatureFileProjects | null = null;

export function getCachedProjects() {
  return cachedProjects;
}

export function setCachedProjects(projects: FeatureFileProjects) {
  cachedProjects = projects;
}
