# Graph Report - daedalus  (2026-08-09)

## Corpus Check
- 170 files · ~146,729 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1501 nodes · 2784 edges · 105 communities (88 shown, 17 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 262 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a0bc488a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- orchestrator.py
- feature-files-dashboard.tsx
- architecture_document.py
- agent-output-viewer.tsx
- feature-file-graph.tsx
- architecture.py
- main.py
- architecture-view.ts
- devDependencies
- Feature-First Graph Workspace Shell
- compilerOptions
- ensure_structured_cp_doc
- migration_deployment.py
- scan_feature_file_projects
- feature-workspace-utils.ts
- run_agent_prompt_cycle
- parameter-file-parser.ts
- main.py
- README.md
- summary
- load_daemon_config
- $defs
- run_cursor_exec
- primitive_field_definition
- recurrent-supabase-queries.test.ts
- required
- $ref
- git-sync-panel.tsx
- __init__.py
- update_execution_entry_point_in_toml
- build_codex_prompt
- run_codex_exec
- software-architecture-v1.schema.json
- validate_execution_request
- FeatureExecutionSupervisor
- run_git_sync_cycle
- planning.md
- agent-task-notifications.tsx
- daemon-manager-panel.tsx
- Agent Task Notifications
- Auth-Scoped Supabase Access
- Cursor Agent
- Daedalus Git Worktrees
- Dev Environment Parameter File Loading
- Feature Execution System
- Feature File Communications System
- Git Sync
- Local Daemon Feature File Scanner
- Local Daemon Manager
- Planning Questionnaire
- Recurrent Row Review Protocol
- Frontend Supabase Config
- Supabase Migration Deployment
- System Architecture Communication Engine
- System Architecture Visualization Engine
- Ventures
- architecture.md
- integrating.md
- layout.tsx
- Daedalus Project Instructions
- README.md
- Shared Database Artifacts
- Next.js Agent Rules
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- __init__.py
- Document Icon
- Globe Icon
- Next.js Logo
- Vercel Logo
- Browser Window Icon
- Next.js Project
- Daedalus Workspace
- system_definition
- integrating.md
- page.tsx
- Daedalus Project Instructions
- README.md
- prune-local-branches.sh
- object_field_definition
- __init__.py
- Feature File Graph Display
- Feature Search Fuzzy Finder
- Path
- Popen
- Exception
- Path
- Exception
- Path
- Path
- Popen
- Popen
- Path
- Path
- README.md
- entry-point-picker.tsx
- run_git_sync_cycle
- entry-point-picker.tsx
- system_definition
- agent-models.ts
- FakeResponse

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 50 edges
2. `FeatureFilesDashboard()` - 35 edges
3. `getAuthenticatedSupabaseHeaders()` - 35 edges
4. `run_agent_prompt_cycle()` - 24 edges
5. `generate_architecture_view()` - 23 edges
6. `AgentOutputViewer()` - 21 edges
7. `initialize_project()` - 20 edges
8. `call_daemon_rpc()` - 19 edges
9. `run_cursor_exec()` - 19 edges
10. `main()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `FeatureFilesDashboard()` --indirect_call--> `exchange()`  [INFERRED]
  daedalus-site/app/feature-files-dashboard.tsx → daedalus-site/lib/agent-output-history.test.ts
- `DirectPromptSupervisor` --uses--> `ArchitectureViewSupervisor`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/architecture.py
- `DirectPromptSupervisor` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/communications.py
- `GitWorktreeOrchestrator` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/orchestrator.py → local-daemon/src/daedalus_daemon/communications.py
- `DirectPromptSupervisor` --uses--> `FeatureExecutionSupervisor`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/execution.py

## Import Cycles
- None detected.

## Communities (105 total, 17 thin omitted)

### Community 0 - "orchestrator.py"
Cohesion: 0.16
Nodes (5): get_agent_task_control(), GitWorktreeOrchestrator, CancelOrchestratorTests, MigrationResolverLoopTests, PerTaskIntegrationTests

### Community 1 - "feature-files-dashboard.tsx"
Cohesion: 0.04
Nodes (83): acknowledgeClientReviews(), AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, callRecoveryRpc(), cancelDurableAgentTask() (+75 more)

### Community 2 - "architecture_document.py"
Cohesion: 0.12
Nodes (13): BaseModel, ArchitectureDocumentModel, ArrayFieldDefinition, ChannelDefinition, load_published_architecture_schema(), NamedFieldDefinition, ObjectFieldDefinition, parse_and_validate_architecture_response() (+5 more)

### Community 3 - "agent-output-viewer.tsx"
Cohesion: 0.07
Nodes (60): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerPresentation, AgentOutputViewerProps, architectureActionLabel(), architectureProgressLabel(), formatTime(), logViewerRequest() (+52 more)

### Community 4 - "feature-file-graph.tsx"
Cohesion: 0.05
Nodes (50): applyNodeVisualMetrics(), applyZoomAtPoint(), buildGraphData(), buildProjectFeatureLayout(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor (+42 more)

### Community 5 - "architecture.py"
Cohesion: 0.07
Nodes (22): claim_feature_execution_run(), list_active_feature_execution_runs(), update_feature_execution_run(), FeatureExecutionSupervisor, paired_parameter_file_path(), Path, Popen, resolve_inside_project() (+14 more)

### Community 6 - "main.py"
Cohesion: 0.12
Nodes (39): acquire_lease(), begin_restart(), call_manager_rpc(), claim_restart(), complete_control_request(), complete_recovery(), complete_restart(), get_active_request() (+31 more)

### Community 7 - "architecture-view.ts"
Cohesion: 0.06
Nodes (42): ArchitectureCanvas(), architectureFailureDetail(), ArchitectureProgressStepper(), ArchitectureViewport, ArchitectureVisualization(), ArchitectureVisualizationProps, ChannelTooltip(), clamp() (+34 more)

### Community 8 - "devDependencies"
Cohesion: 0.05
Nodes (40): dependencies, fuse.js, next, react, react-dom, react-markdown, remark-gfm, @supabase/supabase-js (+32 more)

### Community 9 - "Feature-First Graph Workspace Shell"
Cohesion: 0.29
Nodes (6): Agent Output Viewer, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 11 - "ensure_structured_cp_doc"
Cohesion: 0.10
Nodes (22): apply_parameter_file_update(), build_bridge_refinement_context(), build_cp_doc_skeleton(), commit_project_cp_doc(), cp_doc_has_all_sections(), ensure_structured_cp_doc(), extract_bridge_cp_doc(), extract_optional_cp_doc() (+14 more)

### Community 12 - "migration_deployment.py"
Cohesion: 0.12
Nodes (16): blocked(), deploy_pending_migrations(), diagnostic_text(), load_deployment_settings(), migration_files_changed(), positive_int(), project_lock(), project_ref_for_repository() (+8 more)

### Community 13 - "scan_feature_file_projects"
Cohesion: 0.09
Nodes (32): add_snapshot_worktree(), architecture_document_path(), architecture_failure_details(), architecture_log_path(), architecture_operational_failure(), architecture_snapshot_path(), ArchitectureViewSupervisor, build_architecture_correction_prompt() (+24 more)

### Community 14 - "feature-workspace-utils.ts"
Cohesion: 0.15
Nodes (18): extractFeatureFileReferences(), FeatureGraphSelection, FeatureSearchDialog(), FeatureSearchDialogProps, FeatureSearchMode, buildFeatureExecutionRequest(), buildFeatureSearchRecords(), FeatureSearchRecord (+10 more)

### Community 15 - "run_agent_prompt_cycle"
Cohesion: 0.15
Nodes (17): find_github_url(), initialize_project(), load_initializer_settings(), matching_request_marker(), materialize_templates(), normalize_github_url(), publish(), Path (+9 more)

### Community 16 - "parameter-file-parser.ts"
Cohesion: 0.17
Nodes (20): ParameterVariableSelector(), ParameterVariableSelectorProps, ExecutionEntryPointMetadata, isDoubleQuotedString(), isSingleQuotedString(), isSupportedArrayLiteral(), isValidFloat(), normalizeFloatLiteral() (+12 more)

### Community 17 - "main.py"
Cohesion: 0.14
Nodes (18): apply_entry_point_update(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), execute_git_sync_operation(), is_toml_float(), is_toml_string(), parse_entry_point_update_message() (+10 more)

### Community 18 - "README.md"
Cohesion: 0.21
Nodes (24): commit_paths(), commit_worktree_changes(), create_task_worktree(), delete_merged_branch(), find_migration_directories(), format_process_failure(), git_output(), is_clean_worktree() (+16 more)

### Community 19 - "summary"
Cohesion: 0.43
Nodes (3): map_reasoning_for_codex(), run_codex_exec(), RunCodexExecTests

### Community 20 - "load_daemon_config"
Cohesion: 0.10
Nodes (20): 1. Daedalus Site, 2. Backend, 3. Persistent Idea Space, 4. Local Daemon, 5. AI Execution Layer, Core Subsystems, Daedalus, Design Philosophy (+12 more)

### Community 21 - "$defs"
Cohesion: 0.17
Nodes (9): is_cursor_plan_mode_unsupported(), parse_cursor_plan_stream(), parse_cursor_result(), Popen, register_agent_process(), run_cursor_exec(), run_tracked_agent_command(), unregister_agent_process() (+1 more)

### Community 22 - "run_cursor_exec"
Cohesion: 0.13
Nodes (16): boolean, integer, null, number, string, properties, primitive_field_definition, additionalProperties (+8 more)

### Community 23 - "primitive_field_definition"
Cohesion: 0.18
Nodes (7): build_agent_prompt_state_message(), filter_targeted_feature_paths(), parse_agent_prompt_message(), run_agent_prompt_cycle(), CursorProviderRoutingTests, FilterTargetedFeaturePathsTests, RunAgentPromptCycleTests

### Community 24 - "recurrent-supabase-queries.test.ts"
Cohesion: 0.11
Nodes (17): architectureViewSource, batchCleanupMigrationSource, canonicalSchemaSource, daemonMainSource, dashboardSource, deletionConfirmationMigrationSource, deletionRefreshMigrationSource, executionHealthMigrationSource (+9 more)

### Community 25 - "required"
Cohesion: 0.23
Nodes (14): fields, files, id, items, name, source_system_id, summary, target_system_id (+6 more)

### Community 26 - "$ref"
Cohesion: 0.14
Nodes (7): plan_migration_renames(), Publish optional deployment telemetry without blocking a database repair., record_migration_deployment_event(), MigrationDeploymentEventTests, MigrationReconcileTests, VerificationTests, WorktreeSettingsTests

### Community 27 - "git-sync-panel.tsx"
Cohesion: 0.18
Nodes (15): AgentPromptMode, AgentSessionPanel(), AgentSessionPanelProps, getCompactProjectLabel(), getProjectLabel(), getSharedProjectRoot(), GitSyncPanel(), GitSyncPanelProps (+7 more)

### Community 28 - "__init__.py"
Cohesion: 0.12
Nodes (16): additionalProperties, type, additionalProperties, type, $defs, array_field_definition, channel_definition, field_definition (+8 more)

### Community 29 - "update_execution_entry_point_in_toml"
Cohesion: 0.12
Nodes (7): cleanup_task_worktree(), Remove a task worktree once, accepting an already-absent workspace., remove_empty_worktree_directories(), remove_task_worktree_and_branch(), remove_worktree(), TaskDeletionRequestTests, WorktreeTests

### Community 30 - "build_codex_prompt"
Cohesion: 0.14
Nodes (15): items, type, items, type, uniqueItems, $ref, properties, channels (+7 more)

### Community 31 - "run_codex_exec"
Cohesion: 0.22
Nodes (5): build_codex_prompt(), build_cursor_prompt(), build_impl_prep_refinement_context(), build_planning_refinement_context(), BuildCodexPromptTests

### Community 32 - "software-architecture-v1.schema.json"
Cohesion: 0.18
Nodes (10): channels, schema_version, systems, additionalProperties, description, $id, required, $schema (+2 more)

### Community 33 - "validate_execution_request"
Cohesion: 0.29
Nodes (7): object_field_definition, items, type, additionalProperties, properties, type, fields

### Community 34 - "FeatureExecutionSupervisor"
Cohesion: 0.05
Nodes (58): AopSessionPanel(), AopSessionPanelProps, AgentChatExchange, TargetedFeature, AOP_ACTIVE_STATUSES, AOP_CODING_IN_FLIGHT_STATUSES, AOP_TERMINAL_STATUSES, AopCodingTaskStatus (+50 more)

### Community 35 - "run_git_sync_cycle"
Cohesion: 0.24
Nodes (10): call_daemon_rpc(), complete_conversation_deletion(), list_agent_tasks(), list_conversation_deletion_requests(), record_daemon_event(), record_rpc_metrics(), update_agent_task(), load_worktree_settings() (+2 more)

### Community 37 - "planning.md"
Cohesion: 0.17
Nodes (7): run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), FakeGitProcess, RunParameterFilePollCycleTests, RunParameterFileUpdateCycleTests, RunPollCycleTests

### Community 38 - "agent-task-notifications.tsx"
Cohesion: 0.26
Nodes (15): ProjectInitializationRequest, ProjectInitializationResult, ProjectInitializationStatus, ProjectInitializationStep, ProjectInitializationStepStatus, buildDestinationPreview(), formatInitializationDiagnostics(), formatInitializationStep() (+7 more)

### Community 39 - "daemon-manager-panel.tsx"
Cohesion: 0.33
Nodes (5): DaemonManagerPanel(), DaemonManagerRequest, DaemonManagerStatus, formatTime(), Props

### Community 40 - "Agent Task Notifications"
Cohesion: 0.11
Nodes (18): fetch_communication_rows(), fetch_current_message(), fetch_current_messages(), get_supabase_headers(), open_supabase_request(), post_feature_files(), post_git_sync_result(), post_parameter_files() (+10 more)

### Community 41 - "Auth-Scoped Supabase Access"
Cohesion: 0.22
Nodes (11): get_env_config_value(), get_optional_bool(), get_optional_positive_int(), get_poll_interval_ms(), load_daemon_config(), load_env_files(), load_parameter_file(), parse_env_line() (+3 more)

### Community 42 - "Cursor Agent"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 43 - "Daedalus Git Worktrees"
Cohesion: 0.29
Nodes (6): Daedalus Git Worktrees, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 44 - "Dev Environment Parameter File Loading"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 45 - "Feature Execution System"
Cohesion: 0.29
Nodes (6): Agent Prompt Chat, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 46 - "Feature File Communications System"
Cohesion: 0.29
Nodes (6): Agent Task Notifications, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 47 - "Git Sync"
Cohesion: 0.29
Nodes (6): Answer-Oriented Programming, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 48 - "Local Daemon Feature File Scanner"
Cohesion: 0.29
Nodes (6): Automated Project Initialization, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 49 - "Local Daemon Manager"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Manager, Relevant Files, State Log, Summary

### Community 50 - "Planning Questionnaire"
Cohesion: 0.29
Nodes (6): Cursor Agent, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 51 - "Recurrent Row Review Protocol"
Cohesion: 0.29
Nodes (6): Dev Environment Parameter File Loading, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 52 - "Frontend Supabase Config"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature Execution System, Key Points, Relevant Files, State Log, Summary

### Community 53 - "Supabase Migration Deployment"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Supabase Migration Deployment

### Community 54 - "System Architecture Communication Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature File Communications System, Key Points, Relevant Files, State Log, Summary

### Community 55 - "System Architecture Visualization Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature-File Graph Display, Key Points, Relevant Files, State Log, Summary

### Community 56 - "Ventures"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature-First Graph Workspace Shell, Key Points, Relevant Files, State Log, Summary

### Community 57 - "architecture.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature Search / Fuzzy Finder, Key Points, Relevant Files, State Log, Summary

### Community 59 - "integrating.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Git Sync, Key Points, Relevant Files, State Log, Summary

### Community 60 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 62 - "Daedalus Project Instructions"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Feature File Scanner, Relevant Files, State Log, Summary

### Community 64 - "README.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Planning Questionnaire, Relevant Files, State Log, Summary

### Community 65 - "Shared Database Artifacts"
Cohesion: 0.50
Nodes (3): Automated deployment bootstrap, Shared Database Artifacts, Task-only orchestration contract

### Community 72 - "__init__.py"
Cohesion: 0.29
Nodes (6): Dev Mode, Frontend Supabase Config, Key Points, Relevant Files, State Log, Summary

### Community 80 - "system_definition"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Communication Engine

### Community 81 - "integrating.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Ventures

### Community 82 - "page.tsx"
Cohesion: 0.17
Nodes (6): build_migration_resolver_prompt(), build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt(), reply_indicates_cancel(), PromptTests

### Community 83 - "Daedalus Project Instructions"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 84 - "README.md"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 85 - "prune-local-branches.sh"
Cohesion: 0.33
Nodes (6): AgentTaskNotification, AgentTaskNotifications(), AgentTaskNotificationsProps, AgentTaskNotificationStatus, formatRelativeTime(), STATUS_LABELS

### Community 86 - "object_field_definition"
Cohesion: 0.29
Nodes (6): Auth-Scoped Supabase Access, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 87 - "__init__.py"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Recurrent Row Review Protocol, Relevant Files, State Log, Summary

### Community 90 - "Path"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Visualization Engine

### Community 91 - "Popen"
Cohesion: 0.33
Nodes (5): 4-Stage Development Lifecycle, Evidence Extraction, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 93 - "Exception"
Cohesion: 0.33
Nodes (5): 4-Stage Development Lifecycle, Evidence Extraction, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 94 - "Path"
Cohesion: 0.40
Nodes (4): 4-Stage Development Lifecycle, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 95 - "Exception"
Cohesion: 0.40
Nodes (4): 4-Stage Development Lifecycle, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 96 - "Path"
Cohesion: 0.50
Nodes (3): Daedalus Project Instructions, graphify, Task mode

### Community 97 - "Path"
Cohesion: 0.20
Nodes (9): Applying answers (critical), Bridge Agent Profile, Build-loop tasking, cp_doc structure (required), Free reign vs what to ask, Hard rules, Output contract, Purpose (+1 more)

### Community 98 - "Popen"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 100 - "Popen"
Cohesion: 0.50
Nodes (3): Daedalus Project Instructions, graphify, Task mode

### Community 104 - "entry-point-picker.tsx"
Cohesion: 0.16
Nodes (9): fetch_work_snapshot(), Fetch and normalize the single bounded recurrent response for a cycle., snapshot_communication_messages(), DirectPromptSupervisor, kill_agent_process(), main(), run_cycle_safely(), run_project_initialization_cycle() (+1 more)

### Community 108 - "run_git_sync_cycle"
Cohesion: 0.39
Nodes (3): parse_git_sync_message(), run_git_sync_cycle(), RunGitSyncCycleTests

### Community 110 - "entry-point-picker.tsx"
Cohesion: 0.29
Nodes (6): EntryPointPicker(), Props, getRelevantFileEntryPointSuggestions(), normalizeEntryPointPath(), ParameterFileProjects, ParameterFileRecord

### Community 111 - "system_definition"
Cohesion: 0.15
Nodes (15): properties, system_definition, $ref, $ref, id, name, source_system_id, summary (+7 more)

### Community 112 - "agent-models.ts"
Cohesion: 0.33
Nodes (6): Home(), AgentModel, AgentModelsConfig, loadAgentModels(), FrontendConfig, loadFrontendConfig()

## Knowledge Gaps
- **432 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation`, `AgentPromptMode`, `AgentSessionPanelProps` (+427 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GitWorktreeOrchestrator` connect `orchestrator.py` to `run_git_sync_cycle`, `Agent Task Notifications`, `entry-point-picker.tsx`, `main.py`, `README.md`, `page.tsx`, `$ref`, `update_execution_entry_point_in_toml`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `scan_feature_file_projects()` connect `architecture.py` to `Agent Task Notifications`, `main.py`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `load_daemon_config()` connect `Auth-Scoped Supabase Access` to `Agent Task Notifications`, `main.py`, `README.md`, `entry-point-picker.tsx`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `DirectPromptSupervisor` and `SupabaseUnavailableError`) actually correct?**
  _`GitWorktreeOrchestrator` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 25 inferred relationships involving `RuntimeError` (e.g. with `load_manager_config()` and `load_parameter_file()`) actually correct?**
  _`RuntimeError` has 25 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `run_agent_prompt_cycle()` (e.g. with `.run_cycle()` and `.test_publishes_provider_exception_as_separate_terminal_error()`) actually correct?**
  _`run_agent_prompt_cycle()` has 11 INFERRED edges - model-reasoned connections that need verification._