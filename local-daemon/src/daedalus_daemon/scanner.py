from pathlib import Path


def scan_feature_file_projects(root: Path | None = None) -> dict[str, list[str]]:
    scan_root = Path.cwd().resolve() if root is None else Path(root).resolve()
    projects: dict[str, list[str]] = {}

    feature_file_dirs = sorted(
        (path for path in scan_root.rglob("feature_files") if path.is_dir()),
        key=lambda path: str(path),
    )

    for feature_files_dir in feature_file_dirs:
        project_root = str(feature_files_dir.parent.resolve())
        markdown_files = sorted(
            feature_files_dir.rglob("*.md"),
            key=lambda path: str(path),
        )
        markdown_contents = [
            markdown_file.read_text(encoding="utf-8")
            for markdown_file in markdown_files
        ]

        if project_root in projects:
            projects[project_root].extend(markdown_contents)
        else:
            projects[project_root] = markdown_contents

    return projects
