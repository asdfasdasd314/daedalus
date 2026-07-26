import os
from pathlib import Path
import tomllib


SCANNER_PARAMETERS = Path(__file__).resolve().parents[3] / "parameter_files" / "local-daemon-feature-file-scanner.toml"


def load_snapshot_limits() -> dict[str, int]:
    with SCANNER_PARAMETERS.open("rb") as source:
        values = tomllib.load(source)
    return {
        "individual": int(values["maximum_individual_file_bytes"]),
        "aggregate": int(values["maximum_aggregate_snapshot_bytes"]),
        "files": int(values["maximum_files_per_snapshot"]),
    }


def read_project_file(project_root: Path, relative_path: str) -> dict:
    """Read one explicitly requested file within its project and response bound."""
    root = Path(project_root).resolve()
    candidate = (root / relative_path.replace("\\", "/").removeprefix("./")).resolve()
    if candidate == root or root not in candidate.parents:
        raise ValueError("Requested file must stay inside the selected project.")
    if not candidate.is_file():
        raise ValueError("Requested file is not an existing regular file.")
    content = candidate.read_text(encoding="utf-8")
    byte_size = len(content.encode("utf-8"))
    if byte_size > load_snapshot_limits()["individual"]:
        raise ValueError("Requested file exceeds the per-file response limit.")
    return {"project": str(root), "path": candidate.relative_to(root).as_posix(),
            "byte_size": byte_size, "content": content}


def scan_feature_file_projects(root: Path | None = None) -> dict[str, list[dict[str, str]]]:
    return scan_project_files(root, "feature_files", "*.md", "markdown")


def scan_parameter_file_projects(root: Path | None = None) -> dict[str, list[dict[str, str]]]:
    return scan_project_files(root, "parameter_files", "*.toml", "toml")


def scan_project_files(
    root: Path | None,
    directory_name: str,
    pattern: str,
    content_key: str,
) -> dict[str, list[dict]]:
    scan_root = Path.cwd().resolve() if root is None else Path(root).resolve()
    projects: dict[str, list[dict]] = {}
    limits = load_snapshot_limits()
    aggregate_bytes = 0
    file_count = 0

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
        file_records = []
        for matched_file in matched_files:
            relative_path = matched_file.relative_to(project_root_path).as_posix()
            content = matched_file.read_text(encoding="utf-8")
            byte_size = len(content.encode("utf-8"))
            heading = next((line[2:].strip() for line in content.splitlines() if line.startswith("# ")), relative_path)
            omitted = (
                byte_size > limits["individual"]
                or aggregate_bytes + byte_size > limits["aggregate"]
                or file_count >= limits["files"]
            )
            record = {"path": relative_path, content_key: content}
            if omitted:
                record = {"path": relative_path, content_key: "",
                          "display_heading": heading, "byte_size": byte_size,
                          "omitted": True}
            file_records.append(record)
            file_count += 1
            if not omitted:
                aggregate_bytes += byte_size

        if project_root in projects:
            projects[project_root].extend(file_records)
        else:
            projects[project_root] = file_records

    return projects


def find_project_directories(scan_root: Path, directory_name: str) -> list[Path]:
    project_dirs: list[Path] = []

    def scan_directory(current_directory: Path, allow_descent: bool = True) -> None:
        entries = sorted(os.scandir(current_directory), key=lambda entry: entry.name)
        directory_names = [entry.name for entry in entries if entry.is_dir()]

        if directory_name in directory_names:
            project_dirs.append(current_directory / directory_name)

        is_project = "feature_files" in directory_names
        if is_project and current_directory != scan_root:
            return

        child_directories = [
            Path(entry.path)
            for entry in entries
            if entry.name != ".daedalus-worktrees"
            and entry.is_dir(follow_symlinks=False)
            and not (Path(entry.path) / ".git").is_file()
        ]
        if is_project:
            for child_directory in child_directories:
                scan_directory(child_directory, allow_descent=False)
            return
        if not allow_descent:
            return
        for child_directory in child_directories:
            scan_directory(child_directory)

    scan_directory(scan_root)

    return project_dirs


def is_linked_git_worktree(project_root: Path) -> bool:
    return (project_root / ".git").is_file()
