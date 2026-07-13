import logging
import os
import time
from pathlib import Path


logger = logging.getLogger(__name__)


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
        find_project_directories(scan_root, directory_name),
        key=lambda path: str(path),
    )

    for project_dir in project_dirs:
        project_root_path = project_dir.parent.resolve()

        if is_linked_git_worktree(project_root_path):
            continue

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


def find_project_directories(scan_root: Path, directory_name: str) -> list[Path]:
    project_dirs: list[Path] = []

    def scan_directory(current_directory: Path) -> None:
        scan_started_at = time.perf_counter()
        entries = sorted(os.scandir(current_directory), key=lambda entry: entry.name)
        directory_names = [entry.name for entry in entries if entry.is_dir()]

        if directory_name in directory_names:
            project_dirs.append(current_directory / directory_name)

        elapsed_ms = (time.perf_counter() - scan_started_at) * 1000
        logger.info(
            "Scanned directory %s for %s in %.2f ms",
            current_directory,
            directory_name,
            elapsed_ms,
        )

        child_directories = [
            Path(entry.path)
            for entry in entries
            if entry.name != ".daedalus-worktrees" and entry.is_dir(follow_symlinks=False)
        ]
        for child_directory in child_directories:
            scan_directory(child_directory)

    scan_directory(scan_root)

    return project_dirs


def is_linked_git_worktree(project_root: Path) -> bool:
    return (project_root / ".git").is_file()
