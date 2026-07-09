import type { FeatureFileProjects } from "@/lib/feature-file-cache";

export type WorkspaceFeatureOption = {
  featureName: string;
  filePath: string;
};

export function normalizeFeatureFilePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function normalizeParameterFilePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function getParameterFilePathForFeature(featureFilePath: string) {
  return normalizeFeatureFilePath(featureFilePath)
    .replace(/^feature_files\//, "parameter_files/")
    .replace(/\.md$/, ".toml");
}

export function getFeatureNameFromMarkdown(markdown: string, fallbackPath: string) {
  const headingLine = markdown.split("\n").find((line) => line.startsWith("# "));

  if (!headingLine) {
    return fallbackPath;
  }

  return headingLine.replace(/^# /, "").trim() || fallbackPath;
}

export function getFeatureOptionsForProject(
  projects: FeatureFileProjects,
  projectDirectory: string,
): WorkspaceFeatureOption[] {
  if (!projectDirectory) {
    return [];
  }

  const projectFeatures = projects[projectDirectory] ?? [];

  return projectFeatures.map((feature) => ({
    featureName: getFeatureNameFromMarkdown(feature.markdown, feature.path),
    filePath: normalizeFeatureFilePath(feature.path),
  }));
}

export function getFeatureTagsForPaths(
  projects: FeatureFileProjects,
  featureFilePaths: string[],
): WorkspaceFeatureOption[] {
  const featureNameByPath = new Map<string, string>();

  Object.values(projects).forEach((projectFeatures) => {
    projectFeatures.forEach((feature) => {
      const normalizedPath = normalizeFeatureFilePath(feature.path);
      featureNameByPath.set(
        normalizedPath,
        getFeatureNameFromMarkdown(feature.markdown, normalizedPath),
      );
    });
  });

  return featureFilePaths.map((filePath) => {
    const normalizedPath = normalizeFeatureFilePath(filePath);

    return {
      featureName: featureNameByPath.get(normalizedPath) ?? normalizedPath,
      filePath: normalizedPath,
    };
  });
}
