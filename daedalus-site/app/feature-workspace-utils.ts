import type { FeatureFileProjects } from "@/lib/feature-file-cache";

export type WorkspaceFeatureOption = {
  featureName: string;
  filePath: string;
};

export type FeatureSearchRecord = {
  featureName: string;
  filePath: string;
  markdown: string;
  projectLabel: string;
  projectPath: string;
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

function getSharedProjectRoot(projectDirectories: string[]) {
  if (projectDirectories.length === 0) {
    return "";
  }

  const sharedSegments = projectDirectories[0].split("/").filter(Boolean);

  for (const projectDirectory of projectDirectories.slice(1)) {
    const segments = projectDirectory.split("/").filter(Boolean);

    while (
      sharedSegments.length > 0 &&
      sharedSegments.some((segment, index) => segments[index] !== segment)
    ) {
      sharedSegments.pop();
    }
  }

  return sharedSegments.join("/");
}

export function getProjectLabel(
  projectDirectory: string,
  projectDirectories: string[],
) {
  const normalizedDirectory = projectDirectory.replace(/\\/g, "/");
  const sharedRoot = getSharedProjectRoot(projectDirectories);

  if (!sharedRoot) {
    return normalizedDirectory;
  }

  const rootPrefix = `/${sharedRoot}/`;
  const rootlessDirectory = normalizedDirectory.startsWith(rootPrefix)
    ? normalizedDirectory.slice(rootPrefix.length)
    : normalizedDirectory.replace(new RegExp(`^/?${sharedRoot}/?`), "");

  return rootlessDirectory || normalizedDirectory.split("/").filter(Boolean).at(-1) || normalizedDirectory;
}

export function getCompactProjectLabel(
  projectDirectory: string,
  projectDirectories: string[],
) {
  const relativeLabel = getProjectLabel(projectDirectory, projectDirectories);
  const segments = relativeLabel.split("/").filter(Boolean);

  if (segments.length === 0) {
    return relativeLabel;
  }

  if (segments.length === 1) {
    return segments[0];
  }

  const trailingSegments = segments.slice(-2).join("/");

  return `.../${trailingSegments}`;
}

export function buildFeatureSearchRecords(
  projects: FeatureFileProjects,
): FeatureSearchRecord[] {
  const projectDirectories = Object.keys(projects);
  const records: FeatureSearchRecord[] = [];

  for (const projectPath of projectDirectories) {
    const projectLabel = getProjectLabel(projectPath, projectDirectories);
    const projectFeatures = projects[projectPath] ?? [];

    for (const feature of projectFeatures) {
      const filePath = normalizeFeatureFilePath(feature.path);

      records.push({
        featureName: getFeatureNameFromMarkdown(feature.markdown, filePath),
        filePath,
        markdown: feature.markdown,
        projectLabel,
        projectPath,
      });
    }
  }

  return records;
}
