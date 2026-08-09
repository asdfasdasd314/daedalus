# Graph Report - daedalus  (2026-08-09)

## Corpus Check
- 169 files · ~142,518 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1486 nodes · 2740 edges · 111 communities (93 shown, 18 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 262 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9b3cc3ef`
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
- coding.md
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
- properties
- integrating.md
- layout.tsx
- SupabaseUnavailableError
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
- Exception
- Path
- Exception
- Path
- Path
- Popen
- Path
- Popen
- Path
- Path
- README.md
- entry-point-picker.tsx
- FeatureExecutionSupervisor
- ensure_structured_cp_doc
- test_main.py
- run_git_sync_cycle
- properties
- system_definition

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 50 edges
2. `FeatureFilesDashboard()` - 35 edges
3. `getAuthenticatedSupabaseHeaders()` - 34 edges
4. `run_agent_prompt_cycle()` - 24 edges
5. `generate_architecture_view()` - 23 edges
6. `AgentOutputViewer()` - 21 edges
7. `initialize_project()` - 20 edges
8. `call_daemon_rpc()` - 19 edges
9. `run_cursor_exec()` - 19 edges
10. `main()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `extractFeatureFileReferences()` --indirect_call--> `normalizeFeatureFilePath()`  [INFERRED]
  daedalus-site/app/feature-file-graph.tsx → daedalus-site/app/feature-workspace-utils.ts
- `FeatureFilesDashboard()` --indirect_call--> `exchange()`  [INFERRED]
  daedalus-site/app/feature-files-dashboard.tsx → daedalus-site/lib/agent-output-history.test.ts
- `DirectPromptSupervisor` --uses--> `ArchitectureViewSupervisor`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/architecture.py
- `DirectPromptSupervisor` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/communications.py
- `GitWorktreeOrchestrator` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/orchestrator.py → local-daemon/src/daedalus_daemon/communications.py

## Import Cycles
- None detected.

## Communities (111 total, 18 thin omitted)

### Community 0 - "orchestrator.py"
Cohesion: 0.19
Nodes (3): GitWorktreeOrchestrator, CancelOrchestratorTests, PerTaskIntegrationTests

### Community 1 - "feature-files-dashboard.tsx"
Cohesion: 0.05
Nodes (60): acknowledgeClientReviews(), AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, callRecoveryRpc(), cancelDurableAgentTask() (+52 more)

### Community 2 - "architecture_document.py"
Cohesion: 0.10
Nodes (22): clampNumber(), FeatureFilesDashboard(), fetchActiveAgentTaskSummaries(), fetchAgentTaskById(), fetchDaemonPayload(), fetchDurableTaskDeletionRequests(), fetchFeatureExecutionHydration(), fetchFeatureExecutionRunDetail() (+14 more)

### Community 3 - "agent-output-viewer.tsx"
Cohesion: 0.09
Nodes (46): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerPresentation, AgentOutputViewerProps, architectureActionLabel(), architectureProgressLabel(), formatTime(), logViewerRequest() (+38 more)

### Community 4 - "feature-file-graph.tsx"
Cohesion: 0.06
Nodes (39): applyNodeVisualMetrics(), applyZoomAtPoint(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor, FeatureEdge, FeatureFileGraph() (+31 more)

### Community 5 - "architecture.py"
Cohesion: 0.15
Nodes (11): find_project_directories(), is_linked_git_worktree(), load_snapshot_limits(), Path, Read one explicitly requested file within its project and response bound., read_project_file(), scan_feature_file_projects(), scan_parameter_file_projects() (+3 more)

### Community 6 - "main.py"
Cohesion: 0.12
Nodes (39): acquire_lease(), begin_restart(), call_manager_rpc(), claim_restart(), complete_control_request(), complete_recovery(), complete_restart(), get_active_request() (+31 more)

### Community 7 - "architecture-view.ts"
Cohesion: 0.06
Nodes (43): ArchitectureCanvas(), architectureFailureDetail(), ArchitectureProgressStepper(), ArchitectureViewport, ArchitectureVisualization(), ArchitectureVisualizationProps, ChannelTooltip(), clamp() (+35 more)

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
Cohesion: 0.11
Nodes (18): apply_entry_point_update(), commit_project_cp_doc(), extract_bridge_cp_doc(), extract_optional_cp_doc(), persist_bridge_cp_doc_from_reply(), persist_optional_cp_doc_from_reply(), Path, Write cp_doc.md at the project root. Agents must not write this themselves. (+10 more)

### Community 12 - "migration_deployment.py"
Cohesion: 0.12
Nodes (14): blocked(), deploy_pending_migrations(), diagnostic_text(), migration_files_changed(), project_lock(), project_ref_for_repository(), Path, Select the sole configured project for an exactly resolved repository. (+6 more)

### Community 13 - "scan_feature_file_projects"
Cohesion: 0.06
Nodes (41): BaseModel, add_snapshot_worktree(), architecture_document_path(), architecture_failure_details(), architecture_log_path(), architecture_operational_failure(), architecture_snapshot_path(), ArchitectureViewSupervisor (+33 more)

### Community 14 - "feature-workspace-utils.ts"
Cohesion: 0.16
Nodes (17): FeatureGraphSelection, FeatureSearchDialog(), FeatureSearchDialogProps, FeatureSearchMode, buildFeatureExecutionRequest(), buildFeatureSearchRecords(), FeatureSearchRecord, getFeatureNameFromMarkdown() (+9 more)

### Community 15 - "run_agent_prompt_cycle"
Cohesion: 0.17
Nodes (16): find_github_url(), initialize_project(), load_initializer_settings(), matching_request_marker(), materialize_templates(), normalize_github_url(), publish(), Path (+8 more)

### Community 16 - "parameter-file-parser.ts"
Cohesion: 0.11
Nodes (26): EntryPointPicker(), Props, getRelevantFileEntryPointSuggestions(), normalizeEntryPointPath(), ParameterVariableSelector(), ParameterVariableSelectorProps, ParameterFileProjects, ParameterFileRecord (+18 more)

### Community 17 - "main.py"
Cohesion: 0.12
Nodes (22): snapshot_communication_messages(), apply_parameter_file_update(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), DirectPromptSupervisor, execute_git_sync_operation(), is_toml_float() (+14 more)

### Community 18 - "README.md"
Cohesion: 0.20
Nodes (25): load_deployment_settings(), positive_int(), commit_paths(), commit_worktree_changes(), create_task_worktree(), delete_merged_branch(), find_migration_directories(), format_process_failure() (+17 more)

### Community 19 - "summary"
Cohesion: 0.07
Nodes (40): PlanningResponse(), AopSessionPanelProps, Home(), AgentChatExchange, TargetedFeature, AgentModel, AgentModelsConfig, loadAgentModels() (+32 more)

### Community 20 - "load_daemon_config"
Cohesion: 0.10
Nodes (20): 1. Daedalus Site, 2. Backend, 3. Persistent Idea Space, 4. Local Daemon, 5. AI Execution Layer, Core Subsystems, Daedalus, Design Philosophy (+12 more)

### Community 21 - "$defs"
Cohesion: 0.22
Nodes (5): is_cursor_plan_mode_unsupported(), parse_cursor_plan_stream(), parse_cursor_result(), run_cursor_exec(), RunCursorExecTests

### Community 22 - "run_cursor_exec"
Cohesion: 0.17
Nodes (12): boolean, integer, null, number, string, additionalProperties, properties, type (+4 more)

### Community 23 - "primitive_field_definition"
Cohesion: 0.17
Nodes (7): build_agent_prompt_state_message(), filter_targeted_feature_paths(), parse_agent_prompt_message(), run_agent_prompt_cycle(), AgentOutputHistoryPublicationTests, FilterTargetedFeaturePathsTests, RunAgentPromptCycleTests

### Community 24 - "recurrent-supabase-queries.test.ts"
Cohesion: 0.11
Nodes (17): architectureViewSource, batchCleanupMigrationSource, canonicalSchemaSource, daemonMainSource, dashboardSource, deletionConfirmationMigrationSource, deletionRefreshMigrationSource, executionHealthMigrationSource (+9 more)

### Community 25 - "required"
Cohesion: 0.23
Nodes (14): fields, files, id, items, name, source_system_id, summary, target_system_id (+6 more)

### Community 26 - "$ref"
Cohesion: 0.14
Nodes (7): build_migration_resolver_prompt(), Publish optional deployment telemetry without blocking a database repair., record_migration_deployment_event(), MigrationDeploymentEventTests, MigrationResolverLoopTests, VerificationTests, WorktreeSettingsTests

### Community 27 - "git-sync-panel.tsx"
Cohesion: 0.17
Nodes (16): AgentPromptMode, AgentSessionPanel(), AgentSessionPanelProps, AopSessionPanel(), getCompactProjectLabel(), getProjectLabel(), getSharedProjectRoot(), GitSyncPanel() (+8 more)

### Community 28 - "__init__.py"
Cohesion: 0.12
Nodes (16): additionalProperties, type, $defs, channel_definition, field_definition, identifier, non_empty_string, system_definition (+8 more)

### Community 29 - "update_execution_entry_point_in_toml"
Cohesion: 0.15
Nodes (6): cleanup_task_worktree(), Remove a task worktree once, accepting an already-absent workspace., remove_empty_worktree_directories(), remove_task_worktree_and_branch(), remove_worktree(), TaskDeletionRequestTests

### Community 30 - "build_codex_prompt"
Cohesion: 0.14
Nodes (15): items, type, items, type, uniqueItems, $ref, properties, channels (+7 more)

### Community 31 - "run_codex_exec"
Cohesion: 0.21
Nodes (6): build_bridge_refinement_context(), build_codex_prompt(), build_cursor_prompt(), build_impl_prep_refinement_context(), build_planning_refinement_context(), BuildCodexPromptTests

### Community 32 - "software-architecture-v1.schema.json"
Cohesion: 0.18
Nodes (10): channels, schema_version, systems, additionalProperties, description, $id, required, $schema (+2 more)

### Community 33 - "validate_execution_request"
Cohesion: 0.25
Nodes (6): paired_parameter_file_path(), Path, resolve_inside_project(), validate_execution_entry_point(), validate_execution_request(), ExecutionContractTests

### Community 34 - "FeatureExecutionSupervisor"
Cohesion: 0.13
Nodes (22): AOP_ACTIVE_STATUSES, AOP_CODING_IN_FLIGHT_STATUSES, AOP_TERMINAL_STATUSES, AopCodingTaskStatus, AopExecutionLoopRow, AopLoopAfterCodingTerminal, AopLoopAnswer, AopLoopQuestion (+14 more)

### Community 35 - "run_git_sync_cycle"
Cohesion: 0.45
Nodes (4): record_daemon_event(), update_agent_task(), load_worktree_settings(), utc_now()

### Community 37 - "planning.md"
Cohesion: 0.15
Nodes (8): run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), CursorProviderRoutingTests, FakeGitProcess, RunParameterFilePollCycleTests, RunParameterFileUpdateCycleTests, RunPollCycleTests

### Community 38 - "agent-task-notifications.tsx"
Cohesion: 0.26
Nodes (15): ProjectInitializationRequest, ProjectInitializationResult, ProjectInitializationStatus, ProjectInitializationStep, ProjectInitializationStepStatus, buildDestinationPreview(), formatInitializationDiagnostics(), formatInitializationStep() (+7 more)

### Community 39 - "daemon-manager-panel.tsx"
Cohesion: 0.33
Nodes (5): DaemonManagerPanel(), DaemonManagerRequest, DaemonManagerStatus, formatTime(), Props

### Community 40 - "Agent Task Notifications"
Cohesion: 0.18
Nodes (4): post_project_initialization_result(), FakeResponse, PostGitSyncResultTests, ProjectInitializationCommunicationTests

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

### Community 58 - "properties"
Cohesion: 0.16
Nodes (6): fetch_communication_rows(), fetch_current_message(), fetch_work_snapshot(), Fetch and normalize the single bounded recurrent response for a cycle., upsert_agent_task_turn(), UpdateCurrentMessageTests

### Community 59 - "integrating.md"
Cohesion: 0.29
Nodes (6): Dev Mode, Git Sync, Key Points, Relevant Files, State Log, Summary

### Community 60 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 61 - "SupabaseUnavailableError"
Cohesion: 0.16
Nodes (10): get_supabase_headers(), open_supabase_request(), post_feature_files(), post_git_sync_result(), post_parameter_files(), Exception, SupabaseUnavailableError, update_current_message() (+2 more)

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
Cohesion: 0.18
Nodes (5): build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt(), reply_indicates_cancel(), PromptTests

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

### Community 99 - "Path"
Cohesion: 0.21
Nodes (14): call_daemon_rpc(), claim_architecture_view(), claim_feature_execution_run(), complete_architecture_view(), complete_conversation_deletion(), fetch_current_messages(), get_agent_task_control(), list_active_feature_execution_runs() (+6 more)

### Community 100 - "Popen"
Cohesion: 0.50
Nodes (3): Daedalus Project Instructions, graphify, Task mode

### Community 104 - "entry-point-picker.tsx"
Cohesion: 0.18
Nodes (12): buildGraphData(), buildProjectFeatureLayout(), createClusterColor(), createClusters(), createEdgeId(), createNode(), extractFeatureFileReferences(), extractFeatureName() (+4 more)

### Community 105 - "FeatureExecutionSupervisor"
Cohesion: 0.38
Nodes (3): update_feature_execution_run(), FeatureExecutionSupervisor, Popen

### Community 106 - "ensure_structured_cp_doc"
Cohesion: 0.32
Nodes (6): build_cp_doc_skeleton(), cp_doc_has_all_sections(), ensure_structured_cp_doc(), True when content already contains all five fixed ## section headings., Return a five-section cp_doc template; summary seeds Project Summary only., Return content unchanged if already structured; else wrap into the skeleton.

### Community 107 - "test_main.py"
Cohesion: 0.26
Nodes (7): map_reasoning_for_codex(), Popen, register_agent_process(), run_codex_exec(), run_tracked_agent_command(), unregister_agent_process(), RunCodexExecTests

### Community 108 - "run_git_sync_cycle"
Cohesion: 0.39
Nodes (3): parse_git_sync_message(), run_git_sync_cycle(), RunGitSyncCycleTests

### Community 109 - "properties"
Cohesion: 0.29
Nodes (7): primitive_field_definition, additionalProperties, properties, type, required, default, type

### Community 111 - "system_definition"
Cohesion: 0.13
Nodes (19): properties, object_field_definition, items, type, $ref, $ref, additionalProperties, properties (+11 more)

## Knowledge Gaps
- **431 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation`, `AgentPromptMode`, `AgentSessionPanelProps` (+426 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `initialize_project()` connect `run_agent_prompt_cycle` to `main.py`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `write_project_cp_doc()` connect `ensure_structured_cp_doc` to `main.py`, `README.md`, `primitive_field_definition`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `call_manager_rpc()` connect `main.py` to `README.md`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `DirectPromptSupervisor` and `SupabaseUnavailableError`) actually correct?**
  _`GitWorktreeOrchestrator` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 25 inferred relationships involving `RuntimeError` (e.g. with `load_manager_config()` and `load_parameter_file()`) actually correct?**
  _`RuntimeError` has 25 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `run_agent_prompt_cycle()` (e.g. with `.run_cycle()` and `.test_publishes_provider_exception_as_separate_terminal_error()`) actually correct?**
  _`run_agent_prompt_cycle()` has 11 INFERRED edges - model-reasoned connections that need verification._