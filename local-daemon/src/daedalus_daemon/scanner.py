from pathlib import Path


def scan_feature_file_projects(root: Path | None = None) -> dict[str, list[dict[str, str]]]:
    scan_root = Path.cwd().resolve() if root is None else Path(root).resolve()
    projects: dict[str, list[dict[str, str]]] = {}

    feature_file_dirs = sorted(
        (path for path in scan_root.rglob("feature_files") if path.is_dir()),
        key=lambda path: str(path),
    )

    for feature_files_dir in feature_file_dirs:
        project_root_path = feature_files_dir.parent.resolve()
        project_root = str(project_root_path)
        markdown_files = sorted(
            feature_files_dir.rglob("*.md"),
            key=lambda path: str(path),
        )
        markdown_records = [
            {
                "path": markdown_file.relative_to(project_root_path).as_posix(),
                "markdown": markdown_file.read_text(encoding="utf-8"),
            }
            for markdown_file in markdown_files
        ]

        if project_root in projects:
            projects[project_root].extend(markdown_records)
        else:
            projects[project_root] = markdown_records

    return projects
