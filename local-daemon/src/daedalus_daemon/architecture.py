import json
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
import subprocess
import tomllib
import traceback

from pydantic import ValidationError

from .architecture_document import (
    SOFTWARE_ARCHITECTURE_SCHEMA_PATH,
    format_architecture_validation_errors,
    parse_and_validate_architecture_response,
)
from .communications import (
    claim_architecture_view,
    complete_architecture_view,
    record_daemon_event,
)


DAEDALUS_ROOT = Path(__file__).resolve().parents[3]
ARCHITECTURE_PARAMETER_FILE = (
    DAEDALUS_ROOT
    / "parameter_files"
    / "system-architecture-communication-engine.toml"
)
VISUALIZATION_PARAMETER_FILE = (
    DAEDALUS_ROOT
    / "parameter_files"
    / "system-architecture-visualization-engine.toml"
)


class ArchitectureViewSupervisor:
    def __init__(self, config: dict, run_codex):
        self.config = config
        self.run_codex = run_codex
        self.settings = load_architecture_settings()
        self.executor = ThreadPoolExecutor(
            max_workers=self.settings["maxConcurrentGenerations"]
        )
        self.active: dict[str, tuple[dict, Future]] = {}

    def run_cycle(self, snapshot: dict) -> None:
        self._publish_finished()
        for queued in snapshot.get("architectureViews", []):
            if len(self.active) >= self.settings["maxConcurrentGenerations"]:
                break
            view_id = str(queued.get("id") or "")
            if not view_id or view_id in self.active:
                continue
            claimed = claim_architecture_view(self.config, queued)
            if not claimed:
                continue
            future = self.executor.submit(
                generate_architecture_view,
                claimed,
                self.settings,
                self.run_codex,
            )
            self.active[view_id] = (claimed, future)

    def _publish_finished(self) -> None:
        for view_id, (view, future) in list(self.active.items()):
            if not future.done():
                continue
            try:
                result = future.result()
            except Exception as error:
                result = architecture_operational_failure(
                    "supervisor_result", error, self.settings
                )
            result_kind = classify_architecture_result(result)
            architecture_document = (
                result["architecture_document"]
                if result_kind == "structured_completion"
                else None
            )
            completion_status = (
                "completed" if result_kind == "structured_completion" else "failed"
            )
            completion_error = result.get("error", "")
            if result_kind == "other_generation_failure" and not completion_error:
                completion_error = "Architecture generation failed."
            try:
                completed = complete_architecture_view(
                    self.config, view_id, int(view["generation"]),
                    str(view["updated_at"]), completion_status,
                    result["changed_files"], architecture_document, completion_error,
                    result.get("failure_details"), self.settings["provider"],
                    self.settings["model"], self.settings["reasoning"],
                )
                if not completed:
                    print(f"Architecture View completion was not accepted: view={view_id} generation={view['generation']}")
            except Exception as error:
                details = architecture_failure_details(
                    "completion_publish", error, self.settings
                )
                print(format_architecture_failure_log(view_id, int(view["generation"]), details))
                try:
                    record_daemon_event(
                        self.config, str(view.get("repository") or ""), "error",
                        f"Architecture View {view_id} could not publish its failure result. "
                        f"stage={details['stage']} type={details['error_type']}: {details['message']}",
                    )
                except Exception as event_error:
                    print(f"Architecture View event reporting also failed: {event_error}")
            if completion_status == "failed":
                details = result.get("failure_details") or {}
                print(format_architecture_failure_log(view_id, int(view["generation"]), details))
                try:
                    record_daemon_event(
                        self.config, str(view.get("repository") or ""), "error",
                        f"Architecture View {view_id} failed at {details.get('stage', 'unknown')}: "
                        f"{details.get('message', completion_error)}",
                    )
                except Exception as event_error:
                    print(f"Architecture View event reporting failed: {event_error}")
            self.active.pop(view_id, None)


def classify_architecture_result(result: dict) -> str:
    if result.get("status") == "completed" and isinstance(
        result.get("architecture_document"), dict
    ):
        return "structured_completion"
    if result.get("failure_kind") == "validation_exhausted":
        return "validation_attempts_exhausted"
    return "other_generation_failure"


def load_architecture_settings() -> dict:
    with ARCHITECTURE_PARAMETER_FILE.open("rb") as parameter_file:
        values = tomllib.load(parameter_file)
    with VISUALIZATION_PARAMETER_FILE.open("rb") as parameter_file:
        visualization_values = tomllib.load(parameter_file)
    return {
        "provider": str(values.get("provider", "codex")),
        "model": str(values.get("model", "gpt-5.6-terra")),
        "reasoning": str(values.get("reasoning", "high")),
        "maxConcurrentGenerations": int(values.get("max_concurrent_generations", 1)),
        "maxValidationAttempts": int(
            visualization_values.get("max_validation_attempts", 3)
        ),
        "maxFailureTracebackChars": int(
            values.get("max_failure_traceback_chars", 8000)
        ),
    }


def generate_architecture_view(view: dict, settings: dict, run_codex) -> dict:
    repository = Path(str(view["repository"])).resolve()
    snapshot_path = architecture_snapshot_path(
        repository, str(view["id"]), int(view["generation"])
    )
    changed_files: list[dict] = []
    stage = "changed_file_collection"
    try:
        changed_files = collect_changed_files(
            repository, str(view["base_commit"]), str(view["final_commit"])
        )
        stage = "snapshot_creation"
        add_snapshot_worktree(repository, snapshot_path, str(view["final_commit"]))
        stage = "evidence_collection"
        targeted_paths = [
            str(path)
            for path in view.get("targeted_feature_paths", [])
            if isinstance(path, str)
        ]
        feature_paths = collect_relevant_feature_files(
            snapshot_path, changed_files, targeted_paths
        )
        graph_evidence = collect_graph_community_evidence(
            snapshot_path, changed_files
        )
        prompt = build_architecture_prompt(
            changed_files, feature_paths, graph_evidence
        )
        raw_response = ""
        final_problems = ""
        for attempt in range(settings["maxValidationAttempts"]):
            stage = "model_invocation"
            try:
                raw_response = run_codex(
                    str(snapshot_path), prompt, settings["model"],
                    settings["reasoning"], ask_mode=True,
                )
            except Exception as error:
                return architecture_operational_failure(
                    stage, error, settings, changed_files
                )
            try:
                stage = "document_validation"
                architecture_document = parse_and_validate_architecture_response(
                    raw_response
                )
                return {
                    "status": "completed",
                    "changed_files": changed_files,
                    "architecture_document": architecture_document,
                    "error": "",
                    "failure_kind": "",
                }
            except (json.JSONDecodeError, ValidationError, ValueError) as error:
                final_problems = format_architecture_validation_errors(error)
                if attempt + 1 >= settings["maxValidationAttempts"]:
                    break
                prompt = build_architecture_correction_prompt(
                    changed_files,
                    feature_paths,
                    graph_evidence,
                    raw_response,
                    final_problems,
                )
        return {
            "status": "failed",
            "changed_files": changed_files,
            "architecture_document": None,
            "error": (
                "Architecture document validation exhausted after "
                f"{settings['maxValidationAttempts']} attempts. {final_problems}"
            ),
            "failure_kind": "validation_exhausted",
            "failure_details": {
                "stage": "document_validation",
                "error_type": "ValidationError",
                "message": final_problems,
                "traceback": "",
            },
        }
    except Exception as error:
        return architecture_operational_failure(
            stage, error, settings, changed_files
        )
    finally:
        try:
            remove_snapshot_worktree(repository, snapshot_path)
        except Exception as error:
            print(
                "Architecture View snapshot cleanup failed: "
                f"view={view['id']} generation={view['generation']} error={error}"
            )


def architecture_snapshot_path(repository: Path, view_id: str, generation: int) -> Path:
    root = repository.parent / ".daedalus-worktrees" / repository.name
    return root / f"architecture-{view_id}-{generation}"


def add_snapshot_worktree(repository: Path, snapshot_path: Path, final_commit: str) -> None:
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    run_git(
        repository,
        ["worktree", "add", "--detach", str(snapshot_path), final_commit],
    )


def remove_snapshot_worktree(repository: Path, snapshot_path: Path) -> None:
    if snapshot_path.exists():
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(snapshot_path)],
            cwd=repository,
            capture_output=True,
            text=True,
        )


def collect_changed_files(
    repository: Path, base_commit: str, final_commit: str
) -> list[dict]:
    output = run_git(
        repository,
        [
            "diff",
            "--name-status",
            "--find-renames",
            base_commit,
            final_commit,
            "--",
            ".",
            ":(exclude)graphify-out/**",
        ],
    )
    changed_files: list[dict] = []
    for line in output.splitlines():
        columns = line.split("\t")
        if len(columns) < 2:
            continue
        status = columns[0]
        if status.startswith("R") and len(columns) >= 3:
            changed_files.append({
                "status": status,
                "previousPath": columns[1],
                "path": columns[2],
            })
        else:
            changed_files.append({"status": status, "path": columns[1]})
    return changed_files


def collect_relevant_feature_files(
    snapshot_path: Path,
    changed_files: list[dict],
    targeted_paths: list[str],
) -> list[str]:
    paths = {
        str(item["path"])
        for item in changed_files
        if str(item.get("path") or "").startswith("feature_files/")
        and str(item.get("path") or "").endswith(".md")
        and not str(item.get("status") or "").startswith("D")
    }
    paths.update(targeted_paths)
    changed_paths = [
        path
        for item in changed_files
        for path in (
            str(item.get("path") or ""),
            str(item.get("previousPath") or ""),
        )
        if path
    ]
    feature_root = snapshot_path / "feature_files"
    if feature_root.is_dir():
        for feature_file in feature_root.rglob("*.md"):
            content = feature_file.read_text(encoding="utf-8")
            if any(path and path in content for path in changed_paths):
                paths.add(feature_file.relative_to(snapshot_path).as_posix())
    return sorted(
        path for path in paths if (snapshot_path / path).is_file()
    )


def collect_graph_community_evidence(
    snapshot_path: Path, changed_files: list[dict]
) -> list[dict]:
    graph_path = snapshot_path / "graphify-out" / "graph.json"
    if not graph_path.is_file():
        return []
    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    nodes = graph.get("nodes", []) if isinstance(graph, dict) else []
    links = graph.get("links", []) if isinstance(graph, dict) else []
    final_paths = {
        str(item.get("path") or "").replace("\\", "/")
        for item in changed_files
        if not str(item.get("status") or "").startswith("D")
    }
    changed_nodes = [
        node for node in nodes
        if (
            node.get("file_type") == "code"
            and str(node.get("source_file") or "").replace("\\", "/")
            in final_paths
        )
    ]
    community_ids = {
        node.get("community") for node in changed_nodes
        if node.get("community") is not None
    }
    evidence: list[dict] = []
    for community_id in sorted(community_ids, key=lambda value: str(value)):
        member_ids = {
            str(node.get("id"))
            for node in nodes
            if node.get("community") == community_id
        }
        members = [
            {
                "id": node.get("id"),
                "label": node.get("label"),
                "sourceFile": node.get("source_file"),
                "sourceLocation": node.get("source_location"),
            }
            for node in nodes if node.get("community") == community_id
        ]
        touching_links = [
            {
                "source": link.get("source"),
                "target": link.get("target"),
                "relation": link.get("relation"),
                "confidence": link.get("confidence"),
            }
            for link in links
            if str(link.get("source")) in member_ids
            or str(link.get("target")) in member_ids
        ]
        evidence.append({
            "community": community_id,
            "members": members,
            "touchingRelationships": touching_links,
        })
    return evidence


def build_architecture_prompt(
    changed_files: list[dict],
    feature_paths: list[str],
    graph_evidence: list[dict],
) -> str:
    schema = SOFTWARE_ARCHITECTURE_SCHEMA_PATH.read_text(encoding="utf-8")
    return f"""Create a structured Architecture View for the affected systems in this repository snapshot.

The snapshot is already checked out at the task's final verified commit. Inspect the repository as needed, especially the listed feature files and the relevant Graphify communities. Changed paths are attention hints only: never describe the changes, the diff, commits, before/after states, implementation chronology, or work performed. Describe each affected surviving system only as it exists in this snapshot. Feature files are the primary candidates for system ownership boundaries. Graphify communities are secondary structural evidence. Merge or split candidates when the repository evidence supports it, and do not claim that an inferred system name is an official registered name.

Changed path hints:
{json.dumps(changed_files, indent=2)}

Relevant feature files:
{json.dumps(feature_paths, indent=2)}

Relevant Graphify community evidence:
{json.dumps(graph_evidence, indent=2)}

Published JSON Schema:
{schema}

Return one complete raw JSON object that validates against the published schema. Output JSON only. Do not use Markdown fences or add commentary, diff narration, implementation history, a change summary, commit metadata, Q&A, or implementation notes."""


def build_architecture_correction_prompt(
    changed_files: list[dict],
    feature_paths: list[str],
    graph_evidence: list[dict],
    invalid_response: str,
    validation_problems: str,
) -> str:
    original_prompt = build_architecture_prompt(
        changed_files, feature_paths, graph_evidence
    )
    return f"""{original_prompt}

The previous response was invalid.

Validation problems:
{validation_problems}

Full invalid response:
{invalid_response}

Return a complete corrected document, not a patch. The corrected response must again be one raw JSON object with no Markdown fences or commentary."""


def run_git(repository: Path, arguments: list[str]) -> str:
    process = subprocess.run(
        ["git", *arguments],
        cwd=repository,
        capture_output=True,
        text=True,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or process.stdout.strip())
    return process.stdout.strip()


def architecture_operational_failure(
    stage: str, error: Exception, settings: dict, changed_files: list[dict] | None = None,
) -> dict:
    details = architecture_failure_details(stage, error, settings)
    return {
        "status": "failed",
        "changed_files": changed_files or [],
        "architecture_document": None,
        "error": f"Architecture generation failed at {stage}: {details['message']}",
        "failure_kind": "operational",
        "failure_details": details,
    }


def architecture_failure_details(stage: str, error: Exception, settings: dict) -> dict:
    traceback_text = traceback.format_exc()
    if traceback_text.strip() == "NoneType: None":
        traceback_text = ""
    maximum = settings["maxFailureTracebackChars"]
    return {
        "stage": stage,
        "error_type": type(error).__name__,
        "message": str(error) or repr(error),
        "traceback": traceback_text[:maximum],
    }


def format_architecture_failure_log(view_id: str, generation: int, details: dict) -> str:
    return (
        f"Architecture View failed: view={view_id} generation={generation} "
        f"stage={details.get('stage', 'unknown')} "
        f"type={details.get('error_type', 'unknown')} "
        f"message={details.get('message', 'No error detail provided.')}\n"
        f"{details.get('traceback', '')}"
    )
