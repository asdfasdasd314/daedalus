import json
import logging
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor

DEFAULT_CODEX_MODEL = "gpt-5.5"
DEFAULT_CODEX_REASONING = "medium"
CODEX_PROVIDER = "codex"
CURSOR_PROVIDER = "cursor"
DAEMON_ERROR = "daemon_error"
PARAMETER_FILE_UPDATE_COMMAND = "parameter_file_update"
ENTRY_POINT_UPDATE_COMMAND = "entry_point_update"
CP_DOC_FILENAME = "cp_doc.md"
CP_DOC_HEADING = re.compile(r"^## Cp Doc\s*$", re.IGNORECASE | re.MULTILINE)
OPTIONAL_CP_DOC_HEADING = re.compile(
    r"^## Optional Cp Doc\s*$", re.IGNORECASE | re.MULTILINE,
)
# Sibling bridge-contract headings that end the ## Cp Doc body (not cp_doc's inner ## sections).
CP_DOC_TERMINAL_HEADING = re.compile(
    r"^##\s+(Status|Notes|Questions|Tasks|Optional Cp Doc)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
SECTION_HEADING = re.compile(r"^##\s+\S", re.MULTILINE)
# Five fixed ## headings inside cp_doc.md (the body under bridge reply ## Cp Doc).
CP_DOC_SECTIONS = (
    "Project Summary",
    "Tech Stack",
    "Broad Principles",
    "Project State",
    "Additional Notes",
)
# Required before any coding (or status ready). Broad Principles + Additional Notes optional.
CP_DOC_REQUIRED_SECTIONS = (
    "Project Summary",
    "Tech Stack",
    "Project State",
)
CP_DOC_PLACEHOLDER = "(not yet established)"
PLANNING_PROMPT_PREFIX = """You are in planning mode.

Do not edit files.
Do not run modifying commands.
Just give me a markdown file that outlines your plan to implement my request.
This is NOT the same as a feature file. Feature files may be updated/created as part of the plan, but are not the plan itself.

"""
PLANNING_PROMPT_SUFFIX = f"""Before finalizing the plan, ask the user only about important implementation details that you cannot reasonably infer from the request or repository context.

Questions are optional. Do not ask questions for their own sake; omit them when the plan can proceed with well-reasoned assumptions.

If questions are needed, add this Markdown section at the very bottom of the plan:

```md
## Questions

1. **[question]**:
   - a. [potential answer]
   - b. [potential answer]
   - c. [potential answer]
```

Try to ask at most three questions and never suggest more than three potential answers.

"""
CURSOR_PLANNING_PROMPT_PREFIX = (
    f"{PLANNING_PROMPT_PREFIX.rstrip()}\n\n"
    "Do not try to output the plan to a file.\n\n"
)
ASK_PROMPT_PREFIX = """You are in Ask mode.

Answer the user's project question directly after inspecting the repository as needed.
Do not edit files.
Do not run modifying commands.
Do not perform implementation work or create durable tasks/worktrees.

"""
CURSOR_ASK_PROMPT_PREFIX = ASK_PROMPT_PREFIX
BRIDGE_PROMPT_PREFIX = """You are in bridge mode for answer-oriented programming.

Do not edit files.
Do not run modifying commands.
Do not implement durable tasks yourself.

Your job is to grow a structured centralized project document (cp_doc): long-term memory
of the operator's stated vision, organized so fundamentals stay accountable. This is not
an ideal product spec you invent; it is only what the operator has told you or confirmed
through answers.

cp_doc ALWAYS uses exactly these five ## sections, in this order (full replacement each turn):

1. Project Summary — what is being built and why, at a product level. Relatively stable.
2. Tech Stack — languages, frameworks, hosts, key services. Relatively stable.
3. Broad Principles — philosophical / product / engineering principles that guide
   trade-offs (e.g. "prefer read-only agents", "feature files over sprawling docs").
   Flexible; often updates as Q&A clarifies priorities.
4. Project State — where the project is in development and where priorities lie right now
   (prototyping, mvp, scaling, debugging, redesign, etc.). System-wide priority signal,
   analogous to feature Dev Mode but for the whole product. Mutable as phase/focus shifts.
5. Additional Notes — ephemeral or secondary facts not yet (or never) folded elsewhere.
   Most mutable; optional for coding readiness.

Required before coding (and before status ready): Project Summary, Tech Stack, and
Project State must have real operator-confirmed content (not placeholders / empty).
Broad Principles and Additional Notes are optional for that gate — fill them when useful.

Applying operator answers (critical — do this every turn):
- Fold EVERY stated fact from the direction and Q&A into the matching section bodies
  in the full ## Cp Doc replacement before drafting new questions.
- If an answer names languages, frameworks, hosts, DBs, or services, Tech Stack MUST
  list them on that turn. Never leave "(not yet established)" for any dimension the
  operator already answered.
- Same for Project Summary / Project State / other sections when answers speak to them.
- Never invent stack or requirements the operator has not stated or confirmed.
- Placeholders only for dimensions that remain unanswered after applying all answers.

What to ask vs free reign:
- Later coding agents have free implementation reign once vision is clear. You do too
  for anything that is purely technical and does not change operator product intent.
- Ask ONLY operator-owned decisions you cannot know without them (product goals,
  constraints, stack choices they care about, phase priorities).
- Do not ask questions you can decide yourself. If you do not need the answer to update
  cp_doc, do not ask.

Questions + recommended answers (same pattern as plan-mode questionnaires):
- Prefer high-coverage questions that collapse multiple downstream choices.
- Bias early turns toward required empty/weak sections.
- For each question, suggest at most three potential answers (a / b / c). Prefer
  exactly three strong alternatives when the decision space supports them.
- Every option must be a concrete selectable choice (e.g. "Next.js + Vercel",
  "Python FastAPI", "MVP first, polish later") — real alternatives the operator can pick.
- The host UI already adds an implicit freeform "Enter your own" field after your
  options. Do NOT emit freeform/escape-hatch options yourself (not as a lettered
  choice and not as the last option): no "other", "enter your own", "something else",
  "custom", "specify later", etc.
- Forbidden meta-options (never emit these or close paraphrases): "already decided",
  "this has already been decided", "you decide", "agent chooses", "use best judgment",
  "whatever is best", "N/A", "not sure / let AI decide".
- If a prior answer already decided a topic, update cp_doc and do not re-ask it.

Concision rules for every section:
- Short clauses; drop obvious elaborations and restatements.
- Example: operator says "we need user authentication" -> "User auth needed"
  (not a paragraph about secure login/signup).
- Add mechanism only when the operator specifies it, e.g. "Custom auth (login/signup)"
  vs auth providers — not long prose restating the same idea.
- Section bodies themselves stay flexible markdown (bullets, short lines); only headings
  and section roles are rigid.

Mutability guidance:
- Change Project Summary / Tech Stack when the operator revises foundational intent or
  newly answers those dimensions (answers always win over stale placeholders).
- Broad Principles and Additional Notes may change every turn as understanding evolves.
- Project State should track current phase and priorities without inventing a roadmap.

Only revise cp_doc from operator-supplied direction and answers. Never invent
requirements the operator has not stated or confirmed. If inherited cp_doc lacks the
five headings, restructure into them without inventing new requirements.

"""
BRIDGE_PROMPT_SUFFIX = """Always respond with this Markdown contract only (no file writes).
The host writes your ## Cp Doc section to the project root as cp_doc.md for the
operator and later agents — do not write that file yourself.
Every reply must include a full replacement ## Cp Doc (not a patch) using the five
section headings below exactly (## Project Summary, ## Tech Stack, ## Broad Principles,
## Project State, ## Additional Notes) in that order.

```md
## Status
need_more_questions

## Cp Doc
## Project Summary
[operator-confirmed product summary, or (not yet established)]

## Tech Stack
[languages/frameworks/services from operator answers, or (not yet established)]

## Broad Principles
[optional guiding principles, or (not yet established)]

## Project State
[phase/priorities e.g. prototyping | mvp | scaling | debugging, or (not yet established)]

## Additional Notes
[optional ephemeral notes, or (none yet)]

## Notes
Brief meta about remaining gaps (not product vision prose). Which required sections
are still weak, and why you asked these questions.

## Questions

1. **[question]**:
   - a. [potential answer]
   - b. [potential answer]
   - c. [potential answer]
```

(Host UI appends freeform "Enter your own" after a–c — do not add that option yourself.)

or, when understanding is solid enough (tasks optional / low priority):

```md
## Status
ready

## Cp Doc
## Project Summary
[confirmed summary]

## Tech Stack
[confirmed stack from operator answers — never a placeholder at ready]

## Broad Principles
[principles if any]

## Project State
[current phase and priorities]

## Additional Notes
[optional notes]

## Notes
Brief meta that remaining gaps are acceptable for coding.

## Tasks

1. **Task title**: one complete coding prompt focused on a single unit of work
```

Rules:
- Always include a non-empty ## Cp Doc with the complete five-section document.
- Keep the five ## headings even when a section body is still a placeholder.
- Prefer "(not yet established)" for empty required/optional sections, and
  "(none yet)" for empty Additional Notes — never omit a heading.
- After answers: fill every section those answers speak to. Leaving Tech Stack as
  "(not yet established)" when the operator already named stack facts is wrong.
- status ready ONLY if Project Summary, Tech Stack, and Project State have real
  operator-confirmed content (not placeholders). Broad Principles and Additional Notes
  may remain thin or placeheld.
- If any required section is still placeheld or empty, status must be
  need_more_questions and Questions should target those gaps with concrete options.
- If status is need_more_questions, include a non-empty ## Questions section.
- There is no maximum number of questions per turn; ask as many high-coverage
  questions as needed in one mass batch.
- Never suggest more than three potential answers per question (a–c only), same as
  plan mode. Each must be a concrete pickable alternative — never meta
  "already decided" / "you decide" / freeform-escape options (UI already has
  Enter your own).
- Do not re-ask topics already answered; apply them to cp_doc instead.
- When vision is ready, prefer status ready without multi-task fan-out; the host
  build loop will later request one next_task at a time. Do not emit large ## Tasks
  lists during vision Q&A (omit Tasks or keep optional single illustrative task).
- Coding must not begin until the required three sections are filled (enforce via
  ready/status; do not claim ready early).

"""
BRIDGE_TASKING_SUFFIX = """You are in the AOP BUILD LOOP tasking phase (vision is already ready).
Always respond with this Markdown contract only (no file writes).
Every reply must include a full replacement ## Cp Doc using the five fixed section
headings. Do not invent requirements.

```md
## Status
next_task

## Cp Doc
## Project Summary
…

## Tech Stack
…

## Broad Principles
…

## Project State
…

## Additional Notes
…

## Notes
Why this next slice unblocks MVP.

## Tasks

1. **Task title**: one complete, self-contained coding prompt for this slice only
```

or, when MVP for the stated vision is done:

```md
## Status
mvp_complete

## Cp Doc
… five sections …

## Notes
Why MVP is complete enough.
```

Rules:
- Emit exactly ONE task when status is next_task (never a batch).
- Prefer the smallest vertical/first step (install deps, scaffold, first page, etc.).
- Do not ask vision ## Questions here unless a required cp_doc section regressed
  to a placeholder; implementation questions belong to later prep.
- Do not write files.

"""
IMPL_PREP_PROMPT_PREFIX = """You are in implementation prep mode for answer-oriented programming.

Do not edit files.
Do not run modifying commands.
Do not implement the task yet.

Your job: decide whether this single coding task can start given current context.
Context priority (strict):
1) project-root cp_doc.md (operator vision)
2) targeted feature files
3) graphify structure queries when needed
4) source code only if still required after the above (expensive)

Ask implementation questions only when operator-owned gaps block safe execution of THIS
task (e.g. product constraint affecting scaffolding). You have free reign on technical
choices the operator does not need to make — decide those yourself and do not ask.

Never dump a full plan — operators only see questions and short notes.

If operator answers change product vision, include ## Optional Cp Doc with a full
five-section replacement. The host may persist it. Apply answered stack/vision facts
into that doc; never invent; never leave answered stack as "(not yet established)".

"""
IMPL_PREP_PROMPT_SUFFIX = """Always respond with this Markdown contract only (no file writes).

```md
## Status
need_more_questions

## Notes
What still blocks starting.

## Questions

1. **[question]**:
   - a. [potential answer]
   - b. [potential answer]
   - c. [potential answer]
```

(Host UI appends freeform "Enter your own" after a–c — do not add that option yourself.)

or when ready:

```md
## Status
ready_to_execute

## Notes
Task can be initiated.

## Optional Cp Doc
## Project Summary
…

## Tech Stack
…

## Broad Principles
…

## Project State
…

## Additional Notes
…
```

Rules:
- need_more_questions requires a non-empty ## Questions section.
- ready_to_execute means the operator can start durable coding for this task.
- Ask only when you truly need an operator decision; otherwise choose and proceed to
  ready_to_execute.
- At most three potential answers per question (a–c), each a concrete selectable
  alternative. Host UI already adds freeform "Enter your own" — never emit that or
  meta lines like "already decided", "you decide", "use best judgment", "other".
- Do not implement code. Do not write files.
- Optional Cp Doc only when answers change vision/stack state; fold facts carefully.

"""
CURSOR_BRIDGE_PROMPT_PREFIX = (
    f"{BRIDGE_PROMPT_PREFIX.rstrip()}\n\n"
    "Do not try to write cp_doc.md or any other file to disk; the host persists "
    "cp_doc from your ## Cp Doc section.\n\n"
)
CURSOR_IMPL_PREP_PROMPT_PREFIX = (
    f"{IMPL_PREP_PROMPT_PREFIX.rstrip()}\n\n"
    "Do not write files to disk; the host may persist Optional Cp Doc.\n\n"
)
TARGETED_FEATURE_PATH_REGEX = re.compile(r"^feature_files/[A-Za-z0-9._/-]+\.md$")
TARGETED_FEATURES_PROMPT_PREFIX = (
    "The following prompt reqeusts changes relevant to the following feature files: {paths}"
)
TASK_MODE_CODING = "TASK_MODE: coding"
TASK_MODE_PLANNING = "TASK_MODE: planning"
TASK_MODE_BRIDGE = "TASK_MODE: bridge"

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from daedalus_daemon.communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_REVIEW,
        DAEMON_COMPLETE,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_UPDATE_PURPOSE,
        ENTRY_POINT_UPDATE_PURPOSE,
        SupabaseUnavailableError,
        GIT_SYNC_PURPOSE,
        PROJECT_INITIALIZATION_PURPOSE,
        fetch_current_message,
        fetch_work_snapshot,
        snapshot_communication_messages,
        upsert_agent_task_turn,
        post_feature_files,
        post_git_sync_result,
        post_project_initialization_result,
        post_parameter_files,
        update_current_message,
    )
    from daedalus_daemon.config import (
        get_env_config_value,
        load_daemon_config,
        load_env_files,
    )
    from daedalus_daemon.scanner import (
        scan_feature_file_projects,
        scan_parameter_file_projects,
    )
    from daedalus_daemon.orchestrator import GitWorktreeOrchestrator
    from daedalus_daemon.execution import FeatureExecutionSupervisor
    from daedalus_daemon.architecture import ArchitectureViewSupervisor
    from daedalus_daemon.project_initializer import initialize_project
else:
    from .communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_REVIEW,
        DAEMON_COMPLETE,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_UPDATE_PURPOSE,
        ENTRY_POINT_UPDATE_PURPOSE,
        SupabaseUnavailableError,
        GIT_SYNC_PURPOSE,
        PROJECT_INITIALIZATION_PURPOSE,
        fetch_current_message,
        fetch_work_snapshot,
        snapshot_communication_messages,
        upsert_agent_task_turn,
        post_feature_files,
        post_git_sync_result,
        post_project_initialization_result,
        post_parameter_files,
        update_current_message,
    )
    from .config import get_env_config_value, load_daemon_config, load_env_files
    from .scanner import scan_feature_file_projects, scan_parameter_file_projects
    from .orchestrator import GitWorktreeOrchestrator
    from .execution import FeatureExecutionSupervisor
    from .architecture import ArchitectureViewSupervisor
    from .project_initializer import initialize_project


ACTIVE_AGENT_PROCESSES: dict[str, subprocess.Popen] = {}
ACTIVE_AGENT_LOCK = threading.Lock()


class DirectPromptSupervisor:
    def __init__(self, config: dict):
        self.config = config
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.active_future: Future | None = None

    def run_cycle(self, _config: dict | None = None, read_message=fetch_current_message) -> None:
        if self.active_future:
            if not self.active_future.done():
                return
            self.active_future.result()

        self.active_future = self.executor.submit(
            run_agent_prompt_cycle, self.config, read_message
        )


def register_agent_process(task_id: str, process: subprocess.Popen) -> None:
    with ACTIVE_AGENT_LOCK:
        ACTIVE_AGENT_PROCESSES[task_id] = process


def unregister_agent_process(task_id: str, process: subprocess.Popen) -> None:
    with ACTIVE_AGENT_LOCK:
        current = ACTIVE_AGENT_PROCESSES.get(task_id)
        if current is process:
            ACTIVE_AGENT_PROCESSES.pop(task_id, None)


def kill_agent_process(task_id: str, grace_seconds: float = 2.0) -> bool:
    with ACTIVE_AGENT_LOCK:
        process = ACTIVE_AGENT_PROCESSES.get(task_id)
    if process is None or process.poll() is not None:
        return False

    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return True

    deadline = time.time() + max(0.0, grace_seconds)
    while time.time() < deadline:
        if process.poll() is not None:
            return True
        time.sleep(0.05)

    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    return True


def run_tracked_agent_command(
    task_id: str,
    command: list[str],
    directory: str,
    env: dict[str, str] | None = None,
) -> tuple[int, str, str]:
    process = subprocess.Popen(
        command,
        cwd=directory,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        start_new_session=True,
    )
    register_agent_process(task_id, process)
    try:
        stdout, stderr = process.communicate()
    finally:
        unregister_agent_process(task_id, process)
    return process.returncode, stdout or "", stderr or ""


def run_poll_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_feature_file_projects,
    deliver_projects=post_feature_files,
) -> None:
    run_project_load_cycle(
        config,
        FEATURE_FILE_LOAD_PURPOSE,
        read_message,
        write_message,
        scan_projects,
        deliver_projects,
    )


def run_parameter_file_poll_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_parameter_file_projects,
    deliver_projects=post_parameter_files,
) -> None:
    run_project_load_cycle(
        config,
        PARAMETER_FILE_LOAD_PURPOSE,
        read_message,
        write_message,
        scan_projects,
        deliver_projects,
    )


def run_parameter_file_update_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_parameter_file_projects,
    deliver_projects=post_parameter_files,
) -> None:
    message = read_message(config, PARAMETER_FILE_UPDATE_PURPOSE)
    update_request = parse_parameter_file_update_message(message)

    if not update_request:
        return

    try:
        apply_parameter_file_update(update_request)
        projects = scan_projects()
        deliver_projects(config, projects)
    except Exception as error:
        write_message(
            config,
            PARAMETER_FILE_UPDATE_PURPOSE,
            CLIENT_REVIEW,
            build_parameter_file_update_state_message(DAEMON_ERROR, str(error)),
        )
        return

    write_message(
        config,
        PARAMETER_FILE_UPDATE_PURPOSE,
        DAEMON_COMPLETE,
    )


def run_entry_point_update_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_parameter_file_projects,
    scan_feature_projects=scan_feature_file_projects,
    deliver_projects=post_parameter_files,
) -> None:
    request = parse_entry_point_update_message(read_message(config, ENTRY_POINT_UPDATE_PURPOSE))
    if not request:
        return
    try:
        apply_entry_point_update(request, scan_feature_projects())
        deliver_projects(config, scan_projects())
    except Exception as error:
        write_message(config, ENTRY_POINT_UPDATE_PURPOSE, CLIENT_REVIEW, build_entry_point_update_state_message(DAEMON_ERROR, str(error)))
        return
    write_message(config, ENTRY_POINT_UPDATE_PURPOSE, CLIENT_REVIEW, build_entry_point_update_state_message(DAEMON_COMPLETE))


def run_project_load_cycle(
    config: dict,
    purpose: str,
    read_message,
    write_message,
    scan_projects,
    deliver_projects,
) -> None:
    if read_message(config, purpose) is None:
        return
    projects = scan_projects()
    try:
        deliver_projects(config, projects)
    except Exception as error:
        print(f"Failed to deliver {purpose}: {error}")
        write_message(
            config,
            purpose,
            CLIENT_REVIEW,
            json.dumps({"error": str(error)}),
        )
        return
    write_message(config, purpose, DAEMON_COMPLETE)


def run_agent_prompt_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    publish_history=None,
    run_codex_prompt=None,
    run_cursor_prompt=None,
    deliver_chat=None,
) -> None:
    message = read_message(config, AGENT_PROMPT_PURPOSE)

    if not isinstance(message, str) or not message.strip():
        return

    prompt_request = parse_agent_prompt_message(message)

    if not prompt_request:
        return

    prompt_id = prompt_request.get("promptId")

    if not isinstance(prompt_id, str) or not prompt_id.strip():
        return

    directory = prompt_request["directory"]
    prompt = prompt_request["prompt"]
    provider = prompt_request.get("provider", CODEX_PROVIDER)
    model = prompt_request.get("model", DEFAULT_CODEX_MODEL)
    reasoning = prompt_request.get("reasoning", DEFAULT_CODEX_REASONING)
    planning_mode = prompt_request.get("planningMode", False) is True
    ask_mode = prompt_request.get("askMode", False) is True
    bridge_mode = prompt_request.get("bridgeMode", False) is True
    bridge_tasking = prompt_request.get("bridgeTasking", False) is True
    impl_prep_mode = prompt_request.get("implPrepMode", False) is True
    if impl_prep_mode:
        planning_mode = False
        ask_mode = False
        bridge_mode = False
        bridge_tasking = False
    elif bridge_mode:
        planning_mode = False
        ask_mode = False
    elif ask_mode:
        planning_mode = False
    if bridge_tasking and not bridge_mode:
        bridge_mode = True
        planning_mode = False
        ask_mode = False
    planning_context = (
        prompt_request.get("planningContext", "")
        if planning_mode
        else (
            prompt_request.get("implPrepContext", "")
            if impl_prep_mode
            else (prompt_request.get("bridgeContext", "") if bridge_mode else "")
        )
    )
    planning_answers = (
        prompt_request.get("planningAnswers", [])
        if planning_mode
        else (
            prompt_request.get("implPrepAnswers", [])
            if impl_prep_mode
            else (prompt_request.get("bridgeAnswers", []) if bridge_mode else [])
        )
    )
    conversation_id = prompt_request.get("conversationId")
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        conversation_id = prompt_id
    targeted_feature_paths = filter_targeted_feature_paths(
        prompt_request.get("targetedFeaturePaths", []),
    )
    if impl_prep_mode:
        mode = "impl_prep"
    elif bridge_mode:
        mode = "bridge"
    elif ask_mode:
        mode = "ask"
    else:
        mode = "planning"
    # Bridge, ask, and impl prep share a non-mutating sandbox.
    # The host still persists cp_doc.md after bridge/impl-prep replies.
    read_only_exec = ask_mode or bridge_mode or impl_prep_mode
    history_publisher = publish_history or upsert_agent_task_turn
    history_args = (
        config, prompt_id, directory, prompt, "", "", provider, model,
        reasoning, mode, targeted_feature_paths, conversation_id,
    )
    if deliver_chat is None:
        history_publisher(*history_args, status="running")
    if bridge_mode:
        seed_source = (
            planning_context.strip()
            if isinstance(planning_context, str) and planning_context.strip()
            else str(prompt)
        )
        seed_cp_doc = ensure_structured_cp_doc(seed_source)
        try:
            write_project_cp_doc(directory, seed_cp_doc)
        except Exception as error:
            detail = f"Failed to seed and commit {CP_DOC_FILENAME}: {error}"
            logging.getLogger(__name__).error("%s (%s)", detail, directory)
            history_publisher(
                config, prompt_id, directory, prompt, "", detail, provider,
                model, reasoning, mode, targeted_feature_paths, conversation_id,
                status="failed",
                status_detail=detail,
            )
            if deliver_chat is None:
                write_message(
                    config, AGENT_PROMPT_PURPOSE, CLIENT_REVIEW,
                    build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
                )
            else:
                write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)
            return
    final_prompt = (
        build_cursor_prompt(
            prompt,
            planning_mode,
            targeted_feature_paths,
            planning_context,
            planning_answers,
            ask_mode=ask_mode,
            bridge_mode=bridge_mode,
            bridge_tasking=bridge_tasking,
            impl_prep_mode=impl_prep_mode,
        )
        if provider == CURSOR_PROVIDER
        else build_codex_prompt(
            prompt,
            planning_mode,
            targeted_feature_paths,
            planning_context,
            planning_answers,
            ask_mode=ask_mode,
            bridge_mode=bridge_mode,
            bridge_tasking=bridge_tasking,
            impl_prep_mode=impl_prep_mode,
        )
    )
    try:
        if provider == CURSOR_PROVIDER:
            reply = (
                run_cursor_exec(
                    directory, final_prompt, planning_mode, ask_mode=read_only_exec,
                )
                if run_cursor_prompt is None
                else (
                    run_cursor_prompt(directory, final_prompt, planning_mode, read_only_exec)
                    if read_only_exec
                    else run_cursor_prompt(directory, final_prompt, planning_mode)
                )
            )
        elif provider == CODEX_PROVIDER:
            reply = (
                run_codex_exec(
                    directory, final_prompt, model, reasoning, ask_mode=read_only_exec,
                )
                if run_codex_prompt is None
                else (
                    run_codex_prompt(
                        directory, final_prompt, model, reasoning, read_only_exec,
                    )
                    if read_only_exec
                    else run_codex_prompt(directory, final_prompt, model, reasoning)
                )
            )
        else:
            raise ValueError(f"Unsupported agent provider: {provider}")
    except Exception as error:
        history_publisher(
            config, prompt_id, directory, prompt, "", str(error), provider,
            model, reasoning, mode, targeted_feature_paths, conversation_id, status="failed",
            status_detail=str(error),
        )
        if deliver_chat is None:
            write_message(
                config, AGENT_PROMPT_PURPOSE, CLIENT_REVIEW,
                build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
            )
        else:
            write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)
        return

    if bridge_mode:
        try:
            persist_bridge_cp_doc_from_reply(directory, reply)
        except Exception as error:
            detail = f"Failed to persist and commit {CP_DOC_FILENAME}: {error}"
            logging.getLogger(__name__).error("%s (%s)", detail, directory)
            history_publisher(
                config, prompt_id, directory, prompt, reply or "", detail, provider,
                model, reasoning, mode, targeted_feature_paths, conversation_id,
                status="failed",
                status_detail=detail,
            )
            if deliver_chat is None:
                write_message(
                    config, AGENT_PROMPT_PURPOSE, CLIENT_REVIEW,
                    build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
                )
            else:
                write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)
            return
    elif impl_prep_mode:
        try:
            persist_optional_cp_doc_from_reply(directory, reply)
        except Exception as error:
            detail = f"Failed to persist and commit optional {CP_DOC_FILENAME}: {error}"
            logging.getLogger(__name__).error("%s (%s)", detail, directory)
            history_publisher(
                config, prompt_id, directory, prompt, reply or "", detail, provider,
                model, reasoning, mode, targeted_feature_paths, conversation_id,
                status="failed",
                status_detail=detail,
            )
            if deliver_chat is None:
                write_message(
                    config, AGENT_PROMPT_PURPOSE, CLIENT_REVIEW,
                    build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
                )
            else:
                write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)
            return

    if deliver_chat is None:
        history_publisher(
            config, prompt_id, directory, prompt, reply, "", provider, model,
            reasoning, mode, targeted_feature_paths, conversation_id, status="completed",
        )
        write_message(
            config, AGENT_PROMPT_PURPOSE, CLIENT_REVIEW,
            build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
        )
    else:
        legacy_args = (
            config, prompt_id, directory, prompt, reply, provider, model,
            reasoning, planning_mode, targeted_feature_paths,
        )
        if ask_mode or bridge_mode or impl_prep_mode:
            deliver_chat(*legacy_args, ask_mode=True)
        else:
            deliver_chat(*legacy_args)
        write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)


def extract_bridge_cp_doc(reply: object) -> str:
    """Return the ## Cp Doc body from a bridge agent reply, if present.

    Inner five-section headings (## Project Summary, etc.) stay inside the body;
    extraction only stops at outer bridge contract headings (Notes/Questions/Tasks).
    """
    if not isinstance(reply, str) or not reply.strip():
        return ""
    text = reply.strip()
    fenced = re.match(r"^```[^\n]*\n([\s\S]*?)\n```\s*$", text)
    if fenced:
        text = fenced.group(1)
    start = CP_DOC_HEADING.search(text)
    if not start:
        return ""
    after = start.end()
    rest = text[after:]
    next_heading = CP_DOC_TERMINAL_HEADING.search(rest)
    body = rest[: next_heading.start()] if next_heading else rest
    return body.strip()


def cp_doc_has_all_sections(content: object) -> bool:
    """True when content already contains all five fixed ## section headings."""
    if not isinstance(content, str) or not content.strip():
        return False
    text = content
    for title in CP_DOC_SECTIONS:
        if not re.search(
            rf"^##\s+{re.escape(title)}\s*$",
            text,
            re.IGNORECASE | re.MULTILINE,
        ):
            return False
    return True


def build_cp_doc_skeleton(project_summary: object = "") -> str:
    """Return a five-section cp_doc template; summary seeds Project Summary only."""
    summary = (
        project_summary.strip()
        if isinstance(project_summary, str) and project_summary.strip()
        else CP_DOC_PLACEHOLDER
    )
    return (
        f"## Project Summary\n{summary}\n\n"
        f"## Tech Stack\n{CP_DOC_PLACEHOLDER}\n\n"
        f"## Broad Principles\n{CP_DOC_PLACEHOLDER}\n\n"
        f"## Project State\n{CP_DOC_PLACEHOLDER}\n\n"
        "## Additional Notes\n(none yet)\n"
    )


def ensure_structured_cp_doc(content: object) -> str:
    """Return content unchanged if already structured; else wrap into the skeleton."""
    if isinstance(content, str) and cp_doc_has_all_sections(content):
        return content.strip() + ("\n" if not content.endswith("\n") else "")
    summary = content.strip() if isinstance(content, str) else ""
    return build_cp_doc_skeleton(summary)


def commit_project_cp_doc(project_directory: object) -> bool:
    """Commit only cp_doc.md on the primary worktree so coding admission stays clean."""
    if not isinstance(project_directory, (str, Path)) or not str(project_directory).strip():
        return False
    from .orchestrator import commit_paths

    return commit_paths(
        str(Path(project_directory).expanduser().resolve()),
        [CP_DOC_FILENAME],
        "Daedalus update cp_doc.md",
    )


def write_project_cp_doc(project_directory: object, content: object) -> Path:
    """Write cp_doc.md at the project root. Agents must not write this themselves."""
    if not isinstance(project_directory, (str, Path)) or not str(project_directory).strip():
        raise ValueError("Project directory is required to write cp_doc.md.")
    body = content if isinstance(content, str) else ""
    if not body.strip():
        raise ValueError("cp_doc content must be non-empty.")
    project_root = Path(project_directory).expanduser().resolve()
    if not project_root.is_dir():
        raise ValueError(f"Project directory does not exist: {project_root}")
    target = (project_root / CP_DOC_FILENAME).resolve()
    if target.parent != project_root:
        raise ValueError("cp_doc.md path must stay inside the selected project.")
    target.write_text(body if body.endswith("\n") else f"{body}\n", encoding="utf-8")
    try:
        commit_project_cp_doc(project_root)
    except Exception as error:
        raise RuntimeError(
            f"Wrote {CP_DOC_FILENAME} but failed to commit it on the primary worktree: {error}"
        ) from error
    return target


def persist_bridge_cp_doc_from_reply(project_directory: object, reply: object) -> Path | None:
    """Persist ## Cp Doc from a bridge reply to project-root cp_doc.md."""
    cp_doc = extract_bridge_cp_doc(reply)
    if not cp_doc:
        return None
    return write_project_cp_doc(project_directory, cp_doc)


def extract_optional_cp_doc(reply: object) -> str:
    """Return ## Optional Cp Doc body from an impl-prep reply, if present."""
    if not isinstance(reply, str) or not reply.strip():
        return ""
    text = reply.strip()
    fenced = re.match(r"^```[^\n]*\n([\s\S]*?)\n```\s*$", text)
    if fenced:
        text = fenced.group(1)
    start = OPTIONAL_CP_DOC_HEADING.search(text)
    if not start:
        return ""
    after = start.end()
    rest = text[after:]
    next_heading = CP_DOC_TERMINAL_HEADING.search(rest)
    body = rest[: next_heading.start()] if next_heading else rest
    return body.strip()


def persist_optional_cp_doc_from_reply(project_directory: object, reply: object) -> Path | None:
    """Persist ## Optional Cp Doc from impl-prep when present."""
    cp_doc = extract_optional_cp_doc(reply)
    if not cp_doc:
        return None
    structured = ensure_structured_cp_doc(cp_doc)
    return write_project_cp_doc(project_directory, structured)


def parse_agent_prompt_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str):
        return None
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

    return parsed_message


def parse_parameter_file_update_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str):
        return None
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

    if parsed_message.get("command") != PARAMETER_FILE_UPDATE_COMMAND:
        return None

    for field_name in ("projectPath", "path", "variableName", "value"):
        if not isinstance(parsed_message.get(field_name), str):
            return None

    return parsed_message


def build_parameter_file_update_state_message(state: str, error: str = "") -> str:
    payload = {
        "command": PARAMETER_FILE_UPDATE_COMMAND,
        "state": state,
    }

    if error:
        payload["error"] = error

    return json.dumps(payload)


def parse_entry_point_update_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str) or not message.strip(): return None
    try: payload = json.loads(message)
    except json.JSONDecodeError: return None
    if not isinstance(payload, dict) or payload.get("command") != ENTRY_POINT_UPDATE_COMMAND: return None
    if payload.get("operation") not in {"add", "update", "delete"}: return None
    if not isinstance(payload.get("projectPath"), str) or not isinstance(payload.get("featureFilePath"), str): return None
    if payload["operation"] != "delete" and not isinstance(payload.get("entryPoint"), str): return None
    return payload


def build_entry_point_update_state_message(state: str, error: str = "") -> str:
    payload = {"command": ENTRY_POINT_UPDATE_COMMAND, "state": state}
    if error: payload["error"] = error
    return json.dumps(payload)


def apply_entry_point_update(request: dict[str, object], scanned_projects: dict[str, list[dict[str, str]]]) -> None:
    project_root = Path(str(request["projectPath"])).resolve()
    if str(project_root) not in scanned_projects: raise ValueError("Selected project is not a scanner-discovered project root.")
    feature_path = str(request["featureFilePath"]).replace("\\", "/").removeprefix("./")
    if feature_path not in {entry["path"] for entry in scanned_projects[str(project_root)]}: raise ValueError("Selected feature file is no longer available in the scanned project.")
    if not feature_path.startswith("feature_files/") or not feature_path.endswith(".md"): raise ValueError("Feature path must use feature_files/*.md.")
    parameter_path = "parameter_files/" + feature_path[len("feature_files/"):-3] + ".toml"
    parameter_file = (project_root / parameter_path).resolve()
    if project_root not in parameter_file.parents or not parameter_file.is_file(): raise ValueError("The selected feature has no paired parameter file.")
    entry_point = str(request.get("entryPoint", "")).strip().replace("\\", "/").removeprefix("./")
    if request["operation"] != "delete":
        if not entry_point or entry_point.startswith("/") or re.match(r"^[A-Za-z]:/", entry_point) or any(part in {"", ".", ".."} for part in entry_point.split("/")): raise ValueError("Entry point must be a nonblank project-relative path.")
        target = (project_root / entry_point).resolve()
        if project_root not in target.parents or not target.is_file(): raise ValueError("Entry point must be an existing regular file inside the selected project.")
    update_execution_entry_point_in_toml(parameter_file, str(request["operation"]), entry_point)


def update_execution_entry_point_in_toml(parameter_file: Path, operation: str, entry_point: str) -> None:
    lines = parameter_file.read_text(encoding="utf-8").split("\n")
    section_start = None; section_end = len(lines); entry_index = None; current_section = ""
    for index, line in enumerate(lines):
        section = re.fullmatch(r"\s*\[(.+)\]\s*", line)
        if section:
            if current_section == "execution" and section_end == len(lines): section_end = index
            current_section = section.group(1).strip()
            if current_section == "execution": section_start = index
            continue
        if current_section == "execution" and re.match(r"\s*entry_point\s*=", line): entry_index = index
    if operation == "add" and entry_index is not None: raise ValueError("This feature already has an entry point.")
    if operation in {"update", "delete"} and entry_index is None: raise ValueError("This feature has no saved entry point.")
    if operation == "delete": lines.pop(entry_index)
    elif entry_index is not None:
        prefix_match = re.match(r"^(\s*entry_point\s*=\s*)(.*)$", lines[entry_index])
        _, inline_comment = split_toml_value_and_comment(prefix_match.group(2).strip())
        lines[entry_index] = prefix_match.group(1) + json.dumps(entry_point) + (f" {inline_comment}" if inline_comment else "")
    elif section_start is not None: lines.insert(section_end, f"entry_point = {json.dumps(entry_point)}")
    else:
        if lines and lines[-1] != "": lines.append("")
        lines.extend(["[execution]", f"entry_point = {json.dumps(entry_point)}"])
    parameter_file.write_text("\n".join(lines), encoding="utf-8")


def apply_parameter_file_update(update_request: dict[str, object]) -> None:
    project_path = str(update_request["projectPath"])
    parameter_path = str(update_request["path"])
    variable_name = str(update_request["variableName"])
    value = str(update_request["value"])

    if not parameter_path.startswith("parameter_files/") or not parameter_path.endswith(".toml"):
        raise ValueError("Only parameter_files/*.toml can be edited.")

    project_root = Path(project_path).resolve()
    absolute_path = (project_root / parameter_path).resolve()

    if absolute_path != project_root and project_root not in absolute_path.parents:
        raise ValueError("Parameter file path must stay inside the selected project.")

    current_toml = absolute_path.read_text(encoding="utf-8")
    updated_toml = update_parameter_variable_in_toml(current_toml, variable_name, value)
    absolute_path.write_text(updated_toml, encoding="utf-8")


def update_parameter_variable_in_toml(toml: str, variable_name: str, draft_value: str) -> str:
    lines = toml.split("\n")
    current_section = ""

    for index, line in enumerate(lines):
        trimmed_line = line.strip()

        if not trimmed_line or trimmed_line.startswith("#"):
            continue

        section_match = re.fullmatch(r"\[(.+)\]", trimmed_line)

        if section_match:
            current_section = section_match.group(1).strip()
            continue

        assignment_match = re.match(r"^(\s*([A-Za-z0-9_.-]+)\s*=\s*)(.+)$", line)

        if not assignment_match:
            continue

        key = assignment_match.group(2).strip()
        full_name = f"{current_section}.{key}" if current_section else key

        if full_name != variable_name:
            continue

        value_text, inline_comment = split_toml_value_and_comment(
            assignment_match.group(3).strip(),
        )
        serialized_value = serialize_parameter_value(value_text, draft_value)
        lines[index] = (
            assignment_match.group(1)
            + serialized_value
            + (f" {inline_comment}" if inline_comment else "")
        )
        return "\n".join(lines)

    raise ValueError(f'Variable "{variable_name}" was not found in this parameter file.')


def split_toml_value_and_comment(value_text: str) -> tuple[str, str]:
    in_single_quote = False
    in_double_quote = False

    for index, character in enumerate(value_text):
        previous_character = value_text[index - 1] if index > 0 else ""

        if character == '"' and not in_single_quote and previous_character != "\\":
            in_double_quote = not in_double_quote
            continue

        if character == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
            continue

        if character == "#" and not in_single_quote and not in_double_quote:
            return value_text[:index].strip(), value_text[index:].strip()

    return value_text.strip(), ""


def serialize_parameter_value(current_value: str, draft_value: str) -> str:
    trimmed_draft = draft_value.strip()

    if is_toml_string(current_value):
        return json.dumps(draft_value)

    if current_value in {"true", "false"}:
        if trimmed_draft not in {"true", "false"}:
            raise ValueError("Booleans must be either true or false.")

        return trimmed_draft

    if re.fullmatch(r"[+-]?\d+", current_value):
        if not re.fullmatch(r"[+-]?\d+", trimmed_draft):
            raise ValueError("Integers must be whole numbers.")

        return trimmed_draft

    if is_toml_float(current_value):
        if not is_toml_float(trimmed_draft):
            raise ValueError("Floats must be valid numbers.")

        return trimmed_draft

    if current_value.startswith("[") and current_value.endswith("]"):
        if not trimmed_draft.startswith("[") or not trimmed_draft.endswith("]"):
            raise ValueError("Arrays must stay in TOML array form.")

        return trimmed_draft

    raise ValueError("This TOML value shape is not editable yet.")


def is_toml_string(value: str) -> bool:
    return (
        (value.startswith('"') and value.endswith('"'))
        or (value.startswith("'") and value.endswith("'"))
    )


def is_toml_float(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"[+-]?((\d+\.\d*)|(\d*\.\d+)|(\d+e[+-]?\d+)|(\d+\.\d*e[+-]?\d+)|(\d*\.\d+e[+-]?\d+))",
            value,
            re.IGNORECASE,
        ),
    )


def build_agent_prompt_state_message(prompt_id: str, state: str) -> str:
    return json.dumps({
        "promptId": prompt_id,
        "state": state,
    })


def build_git_sync_state_message(request_id: str, state: str) -> str:
    return json.dumps({
        "requestId": request_id,
        "state": state,
    })


def parse_git_sync_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str):
        return None
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

    return parsed_message


def run_git_command(
    directory: str,
    command: list[str],
    run_process=subprocess.run,
    include_stdout: bool = False,
) -> dict[str, object]:
    result = run_process(
        command,
        cwd=directory,
        capture_output=True,
        text=True,
    )

    return {
        "command": command,
        "exitCode": result.returncode,
        "stdout": result.stdout if include_stdout else "",
        "stderr": result.stderr if result.returncode != 0 else "",
    }


def build_skipped_push_step(reason: str) -> dict[str, object]:
    return {
        "command": ["git", "push"],
        "exitCode": None,
        "stdout": "",
        "stderr": reason,
        "skipped": True,
    }


def execute_git_sync_operation(
    directory: str,
    operation: str,
    message: str = "",
    run_process=subprocess.run,
    base_commit: str = "",
) -> tuple[list[dict[str, object]], str]:
    steps: list[dict[str, object]] = []

    if operation == "commit":
        add_step = run_git_command(directory, ["git", "add", "."], run_process)
        steps.append(add_step)

        if add_step["exitCode"] != 0:
            return steps, "failed"

        commit_step = run_git_command(
            directory,
            ["git", "commit", "-m", message],
            run_process,
        )
        steps.append(commit_step)

        if commit_step["exitCode"] != 0:
            return steps, "failed"

        return steps, "success"

    if operation == "sync":
        pull_step = run_git_command(directory, ["git", "pull"], run_process)
        steps.append(pull_step)

        if pull_step["exitCode"] != 0:
            steps.append(
                build_skipped_push_step("Skipped because git pull failed."),
            )
            return steps, "failed"

        push_step = run_git_command(directory, ["git", "push"], run_process)
        steps.append(push_step)

        if push_step["exitCode"] != 0:
            return steps, "failed"

        return steps, "success"

    if operation == "status":
        status_step = run_git_command(
            directory,
            ["git", "status"],
            include_stdout=True,
            run_process=run_process,
        )
        steps.append(status_step)
        return steps, "success" if status_step["exitCode"] == 0 else "failed"

    if operation == "resolve_head":
        head_step = run_git_command(
            directory,
            ["git", "rev-parse", "HEAD"],
            include_stdout=True,
            run_process=run_process,
        )
        head_sha = str(head_step.get("stdout") or "").strip()
        steps.append({**head_step, "head": head_sha})
        return steps, "success" if head_step["exitCode"] == 0 and head_sha else "failed"

    if operation == "aop_loop_revert":
        if not base_commit.strip():
            steps.append({
                "command": ["git", "reset", "--hard"],
                "exitCode": 1,
                "stdout": "",
                "stderr": "baseCommit is required for aop_loop_revert.",
            })
            return steps, "failed"
        ancestor = run_git_command(
            directory,
            ["git", "merge-base", "--is-ancestor", base_commit, "HEAD"],
            run_process,
        )
        steps.append(ancestor)
        if ancestor["exitCode"] != 0:
            steps.append({
                "command": ["git", "reset", "--hard", base_commit],
                "exitCode": 1,
                "stdout": "",
                "stderr": "baseCommit is not an ancestor of HEAD; refusing revert.",
            })
            return steps, "failed"
        reset_step = run_git_command(
            directory,
            ["git", "reset", "--hard", base_commit],
            run_process,
        )
        steps.append(reset_step)
        if reset_step["exitCode"] != 0:
            return steps, "failed"
        clean_step = run_git_command(
            directory,
            ["git", "clean", "-fd"],
            run_process,
        )
        steps.append(clean_step)
        if clean_step["exitCode"] != 0:
            return steps, "failed"
        head_step = run_git_command(
            directory,
            ["git", "rev-parse", "HEAD"],
            include_stdout=True,
            run_process=run_process,
        )
        head_sha = str(head_step.get("stdout") or "").strip()
        steps.append({**head_step, "head": head_sha})
        return steps, "success" if head_step["exitCode"] == 0 else "failed"

    return steps, "failed"


def run_git_sync_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    deliver_result=post_git_sync_result,
    run_process=subprocess.run,
) -> None:
    message = read_message(config, GIT_SYNC_PURPOSE)

    if not isinstance(message, str) or not message.strip():
        return

    git_request = parse_git_sync_message(message)

    if not git_request:
        return

    request_id = git_request.get("requestId")

    if not isinstance(request_id, str) or not request_id.strip():
        return

    directory = git_request.get("directory")
    operation = git_request.get("operation")

    if not isinstance(directory, str) or not directory.strip():
        return

    if operation not in {
        "commit",
        "sync",
        "status",
        "resolve_head",
        "aop_loop_revert",
    }:
        return

    commit_message = ""
    base_commit = ""

    if operation == "commit":
        message_value = git_request.get("message")

        if not isinstance(message_value, str) or not message_value.strip():
            return

        commit_message = message_value
    elif operation == "aop_loop_revert":
        base_value = git_request.get("baseCommit")
        if not isinstance(base_value, str) or not base_value.strip():
            return
        base_commit = base_value.strip()

    steps, status = execute_git_sync_operation(
        directory,
        operation,
        commit_message,
        run_process,
        base_commit=base_commit,
    )

    head_sha = ""
    if status == "success" and operation in {"resolve_head", "aop_loop_revert", "status"}:
        for step in reversed(steps):
            if isinstance(step, dict) and step.get("head"):
                head_sha = str(step.get("head") or "")
                break
        if not head_sha and operation == "resolve_head":
            for step in steps:
                if isinstance(step, dict) and step.get("stdout"):
                    head_sha = str(step.get("stdout") or "").strip().splitlines()[0] if step.get("stdout") else ""

    deliver_result(
        config,
        {
            "requestId": request_id,
            "directory": directory,
            "operation": operation,
            "status": status,
            "steps": steps,
            **({"head": head_sha} if head_sha else {}),
            **({"baseCommit": base_commit} if base_commit else {}),
        },
    )

    write_message(config, GIT_SYNC_PURPOSE, DAEMON_COMPLETE)


def run_project_initialization_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    deliver_result=post_project_initialization_result,
    initialize=initialize_project,
    scan_features=scan_feature_file_projects,
    scan_parameters=scan_parameter_file_projects,
    deliver_features=post_feature_files,
    deliver_parameters=post_parameter_files,
) -> None:
    message = read_message(config, PROJECT_INITIALIZATION_PURPOSE)
    if not isinstance(message, str) or not message.strip():
        return
    try:
        initialization_request = json.loads(message)
    except json.JSONDecodeError as error:
        initialization_request = {}
        parse_error = f"Initialization request is not valid JSON: {error}"
    else:
        parse_error = "" if isinstance(initialization_request, dict) else (
            "Initialization request must be a JSON object."
        )
        if not isinstance(initialization_request, dict):
            initialization_request = {}
    request_id_value = initialization_request.get("requestId")
    request_id = request_id_value.strip() if isinstance(request_id_value, str) else ""

    def publish_progress(result: dict) -> None:
        if result.get("status") == "running":
            deliver_result(config, result)

    try:
        if parse_error:
            raise ValueError(parse_error)
        result = initialize(initialization_request, progress=publish_progress)
    except Exception as error:
        result = {
            "requestId": request_id,
            "projectName": str(initialization_request.get("projectName") or "").strip().lower(),
            "projectDirectory": "",
            "status": "failed",
            "githubUrl": None,
            "error": str(error),
            "steps": [],
        }

    deliver_result(config, result)
    if result.get("status") in {"success", "partial_success"}:
        deliver_features(config, scan_features())
        deliver_parameters(config, scan_parameters())
    write_message(config, PROJECT_INITIALIZATION_PURPOSE, DAEMON_COMPLETE)


def filter_targeted_feature_paths(targeted_feature_paths: object) -> list[str]:
    if not isinstance(targeted_feature_paths, list):
        return []

    clean_paths: list[str] = []
    seen_paths: set[str] = set()

    for candidate in targeted_feature_paths:
        if not isinstance(candidate, str):
            continue

        normalized_path = candidate.strip()

        if normalized_path in seen_paths:
            continue

        if not TARGETED_FEATURE_PATH_REGEX.fullmatch(normalized_path):
            continue

        if ".." in normalized_path.split("/"):
            continue

        seen_paths.add(normalized_path)
        clean_paths.append(normalized_path)

    return clean_paths


def build_codex_prompt(
    prompt: str,
    planning_mode: bool,
    targeted_feature_paths: list[str] | None = None,
    planning_context: str = "",
    planning_answers: list[dict[str, str]] | None = None,
    ask_mode: bool = False,
    bridge_mode: bool = False,
    bridge_tasking: bool = False,
    impl_prep_mode: bool = False,
) -> str:
    prompt_sections: list[str] = []

    if impl_prep_mode:
        prompt_sections.append(TASK_MODE_CODING)
        prompt_sections.append(IMPL_PREP_PROMPT_PREFIX.rstrip())
        prompt_sections.append(IMPL_PREP_PROMPT_SUFFIX.rstrip())
        refinement_context = build_impl_prep_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)
    elif bridge_mode:
        prompt_sections.append(TASK_MODE_BRIDGE)
        prompt_sections.append(BRIDGE_PROMPT_PREFIX.rstrip())
        if bridge_tasking:
            prompt_sections.append(BRIDGE_TASKING_SUFFIX.rstrip())
        else:
            prompt_sections.append(BRIDGE_PROMPT_SUFFIX.rstrip())
        refinement_context = build_bridge_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)
    elif ask_mode:
        prompt_sections.append(ASK_PROMPT_PREFIX.rstrip())
    elif planning_mode:
        prompt_sections.append(TASK_MODE_PLANNING)
        prompt_sections.append(PLANNING_PROMPT_PREFIX.rstrip())
        prompt_sections.append(PLANNING_PROMPT_SUFFIX.rstrip())
        refinement_context = build_planning_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)
    else:
        prompt_sections.append(TASK_MODE_CODING)

    if targeted_feature_paths:
        prompt_sections.append(
            TARGETED_FEATURES_PROMPT_PREFIX.format(
                paths=", ".join(targeted_feature_paths),
            ),
        )

    prompt_prefix = "\n\n".join(prompt_sections)
    return f"{prompt_prefix}\n\n{prompt}"


def build_cursor_prompt(
    prompt: str,
    planning_mode: bool,
    targeted_feature_paths: list[str] | None = None,
    planning_context: str = "",
    planning_answers: list[dict[str, str]] | None = None,
    ask_mode: bool = False,
    bridge_mode: bool = False,
    bridge_tasking: bool = False,
    impl_prep_mode: bool = False,
) -> str:
    prompt_sections: list[str] = []

    if impl_prep_mode:
        prompt_sections.append(TASK_MODE_CODING)
        prompt_sections.append(CURSOR_IMPL_PREP_PROMPT_PREFIX.rstrip())
        prompt_sections.append(IMPL_PREP_PROMPT_SUFFIX.rstrip())
        refinement_context = build_impl_prep_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)
    elif bridge_mode:
        prompt_sections.append(TASK_MODE_BRIDGE)
        prompt_sections.append(CURSOR_BRIDGE_PROMPT_PREFIX.rstrip())
        if bridge_tasking:
            prompt_sections.append(BRIDGE_TASKING_SUFFIX.rstrip())
        else:
            prompt_sections.append(BRIDGE_PROMPT_SUFFIX.rstrip())
        refinement_context = build_bridge_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)
    elif ask_mode:
        prompt_sections.append(CURSOR_ASK_PROMPT_PREFIX.rstrip())
    elif planning_mode:
        prompt_sections.append(TASK_MODE_PLANNING)
        prompt_sections.append(CURSOR_PLANNING_PROMPT_PREFIX.rstrip())
        prompt_sections.append(PLANNING_PROMPT_SUFFIX.rstrip())
        refinement_context = build_planning_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)
    else:
        prompt_sections.append(TASK_MODE_CODING)

    if targeted_feature_paths:
        prompt_sections.append(
            TARGETED_FEATURES_PROMPT_PREFIX.format(
                paths=", ".join(targeted_feature_paths),
            ),
        )

    prompt_prefix = "\n\n".join(prompt_sections)
    return f"{prompt_prefix}\n\n{prompt}"


def build_planning_refinement_context(
    planning_context: object,
    planning_answers: object,
) -> str:
    sections: list[str] = []

    if isinstance(planning_context, str) and planning_context.strip():
        sections.append(
            "Refine the following current implementation plan using the answers below:\n\n"
            f"{planning_context.strip()}",
        )

    answers: list[str] = []
    if isinstance(planning_answers, list):
        for item in planning_answers:
            if not isinstance(item, dict):
                continue
            question = item.get("question")
            answer = item.get("answer")
            if isinstance(question, str) and isinstance(answer, str):
                answers.append(f"{question}: {len(answers) + 1}. {answer}")

    if answers:
        sections.append("\n".join(answers))

    return "\n\n".join(sections)


def build_bridge_refinement_context(
    bridge_context: object,
    bridge_answers: object,
) -> str:
    sections: list[str] = []

    if isinstance(bridge_context, str) and bridge_context.strip():
        structured = ensure_structured_cp_doc(bridge_context)
        sections.append(
            "Continue the answer-oriented bridge from the current cp_doc "
            "(structured long-term memory of the operator's stated vision). "
            "Revise only from this document and the operator answers below. "
            "Emit a full replacement ## Cp Doc using the five fixed sections "
            "(Project Summary, Tech Stack, Broad Principles, Project State, "
            "Additional Notes) in that order. Prefer updating weak required "
            "sections before optional ones. status ready only when Project Summary, "
            "Tech Stack, and Project State are operator-confirmed (not placeheld). "
            "You have free implementation reign for anything purely technical; ask "
            "only operator-owned decisions. For each question list at most three "
            "concrete a/b/c options (UI already provides Enter your own) — never "
            "meta 'already decided' / 'you decide' / freeform-escape choices.\n\n"
            f"Current cp_doc:\n\n{structured.strip()}",
        )

    answers: list[str] = []
    if isinstance(bridge_answers, list):
        for item in bridge_answers:
            if not isinstance(item, dict):
                continue
            question = item.get("question")
            answer = item.get("answer")
            if isinstance(question, str) and isinstance(answer, str):
                answers.append(f"{question}: {len(answers) + 1}. {answer}")

    if answers:
        sections.append(
            "Operator answers — MUST apply every stated fact into the matching "
            "## section in the full ## Cp Doc replacement this turn. If any answer "
            "names languages/frameworks/hosts/services, write them into Tech Stack "
            "and do not leave that dimension as (not yet established). Never invent "
            "unstated stack. Do not re-ask dimensions already covered here:\n"
            + "\n".join(answers),
        )

    return "\n\n".join(sections)


def build_impl_prep_refinement_context(
    prep_context: object,
    prep_answers: object,
) -> str:
    sections: list[str] = []
    if isinstance(prep_context, str) and prep_context.strip():
        sections.append(
            "Continue implementation prep for this task. Prefer cp_doc → feature "
            "files → graphify → code. Emit ## Status need_more_questions or "
            "ready_to_execute. Do not implement.\n\n"
            f"Task context:\n\n{prep_context.strip()}",
        )
    answers: list[str] = []
    if isinstance(prep_answers, list):
        for item in prep_answers:
            if not isinstance(item, dict):
                continue
            question = item.get("question")
            answer = item.get("answer")
            if isinstance(question, str) and isinstance(answer, str):
                answers.append(f"{question}: {len(answers) + 1}. {answer}")
    if answers:
        sections.append(
            "Operator prep answers so far:\n" + "\n".join(answers),
        )
    return "\n\n".join(sections)


def map_reasoning_for_codex(reasoning: str) -> str:
    if reasoning == "light":
        return "low"
    if reasoning == "extra-high":
        return "xhigh"
    if reasoning == "ultra":
        return "max"

    return reasoning



def run_codex_exec(
    directory: str,
    prompt: str,
    model: str = DEFAULT_CODEX_MODEL,
    reasoning: str = DEFAULT_CODEX_REASONING,
    task_id: str | None = None,
    ask_mode: bool = False,
    writable_directories: list[str] | None = None,
) -> str:
    codex_reasoning = map_reasoning_for_codex(reasoning)
    command = [
        "codex",
        "exec",
        "-m",
        model,
        "-c",
        f'model_reasoning_effort="{codex_reasoning}"',
    ]
    if ask_mode:
        command.extend(["--sandbox", "read-only"])
    elif writable_directories:
        command.extend(["--sandbox", "workspace-write"])
    for writable_directory in writable_directories or []:
        command.extend(["--add-dir", writable_directory])
    command.append(prompt)

    try:
        if task_id:
            returncode, stdout, stderr = run_tracked_agent_command(
                task_id, command, directory
            )
        else:
            process = subprocess.run(
                command,
                cwd=directory,
                capture_output=True,
                text=True,
            )
            returncode = process.returncode
            stdout = process.stdout
            stderr = process.stderr
    except Exception as error:
        return f"Codex failed before execution completed.\n\n{error}"

    if returncode == 0:
        return stdout

    if returncode < 0:
        return (
            "Codex was cancelled before execution completed.\n\n"
            f"STDOUT:\n{stdout}\n\n"
            f"STDERR:\n{stderr}"
        )

    return (
        f"Codex failed with exit code {returncode}\n\n"
        f"STDOUT:\n{stdout}\n\n"
        f"STDERR:\n{stderr}"
    )


def resolve_cursor_api_key() -> str | None:
    project_root = Path(__file__).resolve().parents[3]
    env_config = load_env_files([
        project_root / ".env",
        project_root / "local-daemon" / ".env",
    ])
    return get_env_config_value(env_config, "CURSOR_API_KEY")


def is_cursor_plan_mode_unsupported(stderr: str) -> bool:
    return "--mode" in stderr and (
        "unknown option" in stderr.lower() or "unknown argument" in stderr.lower()
    )


def parse_cursor_result(stdout: str, stderr: str) -> str:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return (
            "Cursor returned malformed JSON.\n\n"
            f"STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
        )

    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, str):
        return (
            "Cursor returned JSON without a result.\n\n"
            f"STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
        )

    return result


def parse_cursor_plan_stream(stdout: str, stderr: str) -> str:
    plan = None
    final_result = None

    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        if not isinstance(event, dict):
            continue

        tool_call = event.get("tool_call")
        if isinstance(tool_call, dict):
            create_plan = tool_call.get("createPlanToolCall")
            if isinstance(create_plan, dict):
                args = create_plan.get("args")
                candidate = args.get("plan") if isinstance(args, dict) else None
                if isinstance(candidate, str) and candidate:
                    plan = candidate

        result = event.get("result")
        if event.get("type") == "result" and isinstance(result, str):
            final_result = result

    if plan is not None:
        return plan

    if final_result is not None:
        return final_result

    return (
        "Cursor planning completed without a native plan or final response.\n\n"
        f"STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
    )


def run_cursor_exec(
    directory: str,
    prompt: str,
    planning_mode: bool = False,
    task_id: str | None = None,
    ask_mode: bool = False,
) -> str:
    if shutil.which("agent") is None:
        return (
            "Cursor CLI is unavailable. Install Cursor CLI so the `agent` "
            "executable is available on the daemon PATH."
        )

    env = os.environ.copy()
    cursor_api_key = resolve_cursor_api_key()
    if cursor_api_key:
        env["CURSOR_API_KEY"] = cursor_api_key

    if ask_mode:
        planning_mode = False
    output_format = "stream-json" if planning_mode else "json"
    command = ["agent", "-p", "--output-format", output_format]
    if planning_mode:
        command.extend(["--trust", "--mode=plan"])
    elif not ask_mode:
        command.append("--force")
    command.append(prompt)

    try:
        if task_id:
            returncode, stdout, stderr = run_tracked_agent_command(
                task_id, command, directory, env
            )
        else:
            process = subprocess.run(
                command,
                cwd=directory,
                capture_output=True,
                text=True,
                env=env,
            )
            returncode = process.returncode
            stdout = process.stdout
            stderr = process.stderr
    except Exception as error:
        return f"Cursor failed before execution completed.\n\n{error}"

    if returncode == 0:
        if planning_mode:
            return parse_cursor_plan_stream(stdout, stderr)
        return parse_cursor_result(stdout, stderr)

    if planning_mode and is_cursor_plan_mode_unsupported(stderr):
        fallback_command = [
            "agent", "-p", "--output-format", output_format, "--trust", prompt
        ]
        try:
            if task_id:
                returncode, stdout, stderr = run_tracked_agent_command(
                    task_id, fallback_command, directory, env
                )
            else:
                process = subprocess.run(
                    fallback_command,
                    cwd=directory,
                    capture_output=True,
                    text=True,
                    env=env,
                )
                returncode = process.returncode
                stdout = process.stdout
                stderr = process.stderr
        except Exception as error:
            return f"Cursor failed before execution completed.\n\n{error}"

        if returncode == 0:
            if planning_mode:
                return parse_cursor_plan_stream(stdout, stderr)
            return parse_cursor_result(stdout, stderr)

    if returncode < 0:
        return (
            "Cursor was cancelled before execution completed.\n\n"
            f"STDOUT:\n{stdout}\n\n"
            f"STDERR:\n{stderr}"
        )

    return (
        f"Cursor failed with exit code {returncode}\n\n"
        f"STDOUT:\n{stdout}\n\n"
        f"STDERR:\n{stderr}"
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    config = load_daemon_config()
    orchestrator = GitWorktreeOrchestrator(
        config, run_codex_exec, run_cursor_exec, kill_agent_process
    )
    execution_supervisor = FeatureExecutionSupervisor(config)
    architecture_supervisor = ArchitectureViewSupervisor(config, run_codex_exec)
    direct_prompt_supervisor = DirectPromptSupervisor(config)

    while True:
        try:
            work_snapshot = fetch_work_snapshot(config)
            communication_reviews = snapshot_communication_messages(work_snapshot)
        except SupabaseUnavailableError as error:
            cooldown_ms = config.get("networkOutageCooldownMs", 15000)
            print(
                "Daemon communication inbox unavailable: "
                f"{error}. Waiting {cooldown_ms}ms before retrying."
            )
            time.sleep(cooldown_ms / 1000)
            continue

        if not run_cycle_safely(
            "agent_orchestrator",
            lambda _current: orchestrator.run_cycle(work_snapshot),
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely(
            "feature_execution",
            lambda _current: execution_supervisor.run_cycle(work_snapshot),
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely(
            "architecture_view",
            lambda _current: architecture_supervisor.run_cycle(work_snapshot),
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        def read_review(_config: dict, purpose: str) -> str | None:
            return communication_reviews.get(purpose)

        if not run_cycle_safely("feature_file_load", lambda current: run_poll_cycle(current, read_message=read_review), config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely(
            "parameter_file_load",
            lambda current: run_parameter_file_poll_cycle(current, read_message=read_review),
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely(
            "parameter_file_update",
            lambda current: run_parameter_file_update_cycle(current, read_message=read_review),
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely("entry_point_update", lambda current: run_entry_point_update_cycle(current, read_message=read_review), config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely("agent_prompt", lambda current: direct_prompt_supervisor.run_cycle(current, read_message=read_review), config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely("git_sync", lambda current: run_git_sync_cycle(current, read_message=read_review), config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely(
            "project_initialization",
            lambda current: run_project_initialization_cycle(current, read_message=read_review),
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        time.sleep(config["pollIntervalMs"] / 1000)


def run_cycle_safely(cycle_name: str, cycle_runner, config: dict) -> bool:
    try:
        cycle_runner(config)
        return True
    except SupabaseUnavailableError as error:
        cooldown_ms = config.get("networkOutageCooldownMs", 15000)
        print(
            f"Daemon cycle paused for {cycle_name}: Supabase unavailable: {error}. "
            f"Waiting {cooldown_ms}ms before retrying.",
        )
        time.sleep(cooldown_ms / 1000)
        return False
    except Exception as error:
        print(f"Daemon cycle failed for {cycle_name}: {error}")
        return True


if __name__ == "__main__":
    main()
