from pathlib import Path


def scan_feature_file_projects(root: Path | None = None) -> dict[str, list[dict[str, str]]]:
    return scan_project_files(root, "feature_files", "*.md", "markdown")


def scan_parameter_file_projects(root: Path | None = None) -> dict[str, list[dict[str, str]]]:
    return scan_project_files(root, "parameter_files", "*.toml", "toml")


def scan_project_files(
    root: Path | None,
    directory_name: str,
    pattern: str,
    content_key: str,
) -> dict[str, list[dict[str, str]]]:
    scan_root = Path.cwd().resolve() if root is None else Path(root).resolve()
    projects: dict[str, list[dict[str, str]]] = {}

    project_dirs = sorted(
        (path for path in scan_root.rglob(directory_name) if path.is_dir()),
        key=lambda path: str(path),
    )

    for project_dir in project_dirs:
        project_root_path = project_dir.parent.resolve()
        project_root = str(project_root_path)
        matched_files = sorted(
            project_dir.rglob(pattern),
            key=lambda path: str(path),
        )
        file_records = [
            {
                "path": matched_file.relative_to(project_root_path).as_posix(),
                content_key: matched_file.read_text(encoding="utf-8"),
            }
            for matched_file in matched_files
        ]

        if project_root in projects:
            projects[project_root].extend(file_records)
        else:
            projects[project_root] = file_records

    return projects
