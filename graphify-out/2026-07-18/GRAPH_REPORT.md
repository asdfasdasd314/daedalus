# Graph Report - daedalus  (2026-07-18)

## Corpus Check
- 140 files · ~116,684 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1232 nodes · 2226 edges · 83 communities (69 shown, 14 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 193 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a2e83c28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- orchestrator.py
- parameter-file-parser.ts
- feature-file-graph.tsx
- agent-output-viewer.tsx
- run_cursor_exec
- main.py
- devDependencies
- feature-files-dashboard.tsx
- compilerOptions
- architecture.py
- scan_feature_file_projects
- UpdateCurrentMessageTests
- main.py
- communications.py
- planning-questionnaire.ts
- planning-questionnaire.ts
- architecture-view.ts
- SupabaseUnavailableError
- FakeResponse
- update_execution_entry_point_in_toml
- GitWorktreeOrchestrator
- __init__.py
- page.tsx
- run_git_sync_cycle
- agent-task-notifications.tsx
- daemon-manager-panel.tsx
- recurrent-supabase-queries.test.ts
- layout.tsx
- Feature-First Graph Workspace Shell
- __init__.py
- Next.js Agent Rules
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- planning.md
- AGENTS.md
- Document Icon
- Globe Icon
- Next.js Logo
- Vercel Logo
- Browser Window Icon
- Next.js Project
- feature-workspace-utils.ts
- README.md
- Supabase Migration Deployment
- run_agent_prompt_cycle
- getProjectLabel
- build_codex_prompt
- load_daemon_config
- Planning Questionnaire
- Recurrent Row Review Protocol
- Frontend Supabase Config
- Ventures
- Daedalus Workspace
- README.md
- $defs
- properties
- $ref
- required
- run_codex_exec
- software-architecture-v1.schema.json
- architecture.md
- entry-point-picker.tsx
- integrating.md
- update_execution_entry_point_in_toml
- Agent Task Notifications
- Auth-Scoped Supabase Access
- Cursor Agent
- Daedalus Git Worktrees
- Dev Environment Parameter File Loading
- Feature Execution System
- Feature File Communications System
- Feature-File Graph Display
- Feature Search / Fuzzy Finder
- Git Sync
- Local Daemon Feature File Scanner
- Local Daemon Manager
- System Architecture Communication Engine
- System Architecture Visualization Engine
- README.md

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 42 edges
2. `getAuthenticatedSupabaseHeaders()` - 29 edges
3. `FeatureFilesDashboard()` - 28 edges
4. `generate_architecture_view()` - 23 edges
5. `SupabaseUnavailableError` - 20 edges
6. `AgentOutputViewer()` - 19 edges
7. `call_daemon_rpc()` - 19 edges
8. `run_agent_prompt_cycle()` - 19 edges
9. `run_cursor_exec()` - 19 edges
10. `main()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `extractFeatureFileReferences()` --indirect_call--> `normalizeFeatureFilePath()`  [INFERRED]
  daedalus-site/app/feature-file-graph.tsx → daedalus-site/app/feature-workspace-utils.ts
- `FeatureFilesDashboard()` --indirect_call--> `exchange()`  [INFERRED]
  daedalus-site/app/feature-files-dashboard.tsx → daedalus-site/lib/agent-output-history.test.ts
- `DirectPromptSupervisor` --uses--> `ArchitectureViewSupervisor`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/architecture.py
- `DirectPromptSupervisor` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/communications.py
- `FakeResponse` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/tests/test_communications.py → local-daemon/src/daedalus_daemon/communications.py

## Import Cycles
- None detected.

## Communities (83 total, 14 thin omitted)

### Community 0 - "orchestrator.py"
Cohesion: 0.06
Nodes (45): get_agent_task_control(), Exception, record_daemon_event(), SupabaseUnavailableError, update_agent_task(), build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt() (+37 more)

### Community 1 - "parameter-file-parser.ts"
Cohesion: 0.17
Nodes (20): ParameterVariableSelector(), ParameterVariableSelectorProps, ExecutionEntryPointMetadata, isDoubleQuotedString(), isSingleQuotedString(), isSupportedArrayLiteral(), isValidFloat(), normalizeFloatLiteral() (+12 more)

### Community 2 - "feature-file-graph.tsx"
Cohesion: 0.05
Nodes (51): applyNodeVisualMetrics(), applyZoomAtPoint(), buildGraphData(), buildProjectFeatureLayout(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor (+43 more)

### Community 3 - "agent-output-viewer.tsx"
Cohesion: 0.07
Nodes (57): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerPresentation, AgentOutputViewerProps, architectureActionLabel(), architectureProgressLabel(), formatTime(), logViewerRequest() (+49 more)

### Community 4 - "run_cursor_exec"
Cohesion: 0.22
Nodes (5): is_cursor_plan_mode_unsupported(), parse_cursor_plan_stream(), parse_cursor_result(), run_cursor_exec(), RunCursorExecTests

### Community 5 - "main.py"
Cohesion: 0.13
Nodes (35): acquire_lease(), begin_restart(), call_manager_rpc(), claim_restart(), complete_control_request(), complete_recovery(), complete_restart(), get_active_request() (+27 more)

### Community 6 - "devDependencies"
Cohesion: 0.05
Nodes (40): dependencies, fuse.js, next, react, react-dom, react-markdown, remark-gfm, @supabase/supabase-js (+32 more)

### Community 7 - "feature-files-dashboard.tsx"
Cohesion: 0.05
Nodes (54): acknowledgeClientReviews(), AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, callRecoveryRpc(), ClientReviewInbox (+46 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 9 - "architecture.py"
Cohesion: 0.11
Nodes (29): add_snapshot_worktree(), architecture_document_path(), architecture_failure_details(), architecture_log_path(), architecture_operational_failure(), architecture_snapshot_path(), ArchitectureViewSupervisor, build_architecture_correction_prompt() (+21 more)

### Community 10 - "scan_feature_file_projects"
Cohesion: 0.07
Nodes (22): claim_feature_execution_run(), list_active_feature_execution_runs(), update_feature_execution_run(), FeatureExecutionSupervisor, paired_parameter_file_path(), Path, Popen, resolve_inside_project() (+14 more)

### Community 11 - "UpdateCurrentMessageTests"
Cohesion: 0.12
Nodes (13): BaseModel, ArchitectureDocumentModel, ArrayFieldDefinition, ChannelDefinition, load_published_architecture_schema(), NamedFieldDefinition, ObjectFieldDefinition, parse_and_validate_architecture_response() (+5 more)

### Community 12 - "main.py"
Cohesion: 0.16
Nodes (18): snapshot_communication_messages(), apply_parameter_file_update(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), DirectPromptSupervisor, execute_git_sync_operation(), is_toml_float() (+10 more)

### Community 13 - "communications.py"
Cohesion: 0.09
Nodes (24): call_daemon_rpc(), complete_architecture_view(), complete_task_deletion(), fetch_communication_rows(), fetch_current_message(), fetch_current_messages(), fetch_work_snapshot(), get_supabase_headers() (+16 more)

### Community 14 - "planning-questionnaire.ts"
Cohesion: 0.14
Nodes (15): blocked(), deploy_pending_migrations(), diagnostic_text(), load_deployment_settings(), migration_files_changed(), positive_int(), project_lock(), Path (+7 more)

### Community 15 - "planning-questionnaire.ts"
Cohesion: 0.10
Nodes (21): clampNumber(), FeatureFilesDashboard(), fetchActiveAgentTaskSummaries(), fetchDaemonPayload(), fetchFeatureExecutionHistorySummaries(), fetchFeatureExecutionHydration(), fetchFeatureExecutionRunDetail(), findParameterFileByPath() (+13 more)

### Community 16 - "architecture-view.ts"
Cohesion: 0.09
Nodes (34): architectureFailureDetail(), ArchitectureProgressStepper(), ArchitectureVisualization(), ArchitectureVisualizationProps, PROGRESS_PHASES, stageOrder(), truncate(), wrapName() (+26 more)

### Community 17 - "SupabaseUnavailableError"
Cohesion: 0.13
Nodes (15): additionalProperties, properties, type, channel_definition, items, type, uniqueItems, $ref (+7 more)

### Community 19 - "update_execution_entry_point_in_toml"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 20 - "GitWorktreeOrchestrator"
Cohesion: 0.33
Nodes (6): boolean, integer, null, number, string, enum

### Community 21 - "__init__.py"
Cohesion: 0.27
Nodes (5): run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), RunParameterFilePollCycleTests, RunPollCycleTests

### Community 22 - "page.tsx"
Cohesion: 0.33
Nodes (6): Home(), AgentModel, AgentModelsConfig, loadAgentModels(), FrontendConfig, loadFrontendConfig()

### Community 23 - "run_git_sync_cycle"
Cohesion: 0.39
Nodes (3): parse_git_sync_message(), run_git_sync_cycle(), RunGitSyncCycleTests

### Community 24 - "agent-task-notifications.tsx"
Cohesion: 0.33
Nodes (6): AgentTaskNotification, AgentTaskNotifications(), AgentTaskNotificationsProps, AgentTaskNotificationStatus, formatRelativeTime(), STATUS_LABELS

### Community 25 - "daemon-manager-panel.tsx"
Cohesion: 0.33
Nodes (5): DaemonManagerPanel(), DaemonManagerRequest, DaemonManagerStatus, formatTime(), Props

### Community 26 - "recurrent-supabase-queries.test.ts"
Cohesion: 0.14
Nodes (12): architectureViewSource, daemonMainSource, dashboardSource, historySource, managerSource, migrationDeploymentEventsSource, migrationSource, orchestratorSource (+4 more)

### Community 27 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 28 - "Feature-First Graph Workspace Shell"
Cohesion: 0.09
Nodes (20): Agent Output Viewer, Dev Mode, Key Points, Relevant Files, State Log, Summary, Agent Prompt Chat, Dev Mode (+12 more)

### Community 37 - "planning.md"
Cohesion: 0.29
Nodes (6): 4-Stage Development Lifecycle, Alignment, Debugging, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 38 - "AGENTS.md"
Cohesion: 0.50
Nodes (3): Daedalus Project Instructions, graphify, Task mode

### Community 45 - "feature-workspace-utils.ts"
Cohesion: 0.21
Nodes (15): FeatureGraphSelection, FeatureSearchDialog(), FeatureSearchDialogProps, FeatureSearchMode, buildFeatureExecutionRequest(), buildFeatureSearchRecords(), FeatureSearchRecord, getFeatureNameFromMarkdown() (+7 more)

### Community 46 - "README.md"
Cohesion: 0.10
Nodes (20): 1. Daedalus Site, 2. Backend, 3. Persistent Idea Space, 4. Local Daemon, 5. AI Execution Layer, Core Subsystems, Daedalus, Design Philosophy (+12 more)

### Community 47 - "Supabase Migration Deployment"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Supabase Migration Deployment

### Community 48 - "run_agent_prompt_cycle"
Cohesion: 0.11
Nodes (11): build_agent_prompt_state_message(), build_cursor_prompt(), filter_targeted_feature_paths(), parse_agent_prompt_message(), run_agent_prompt_cycle(), AgentOutputHistoryPublicationTests, CursorProviderRoutingTests, FakeGitProcess (+3 more)

### Community 49 - "getProjectLabel"
Cohesion: 0.13
Nodes (17): AgentPromptMode, AgentSessionPanel(), AgentSessionPanelProps, getCompactProjectLabel(), getProjectLabel(), getSharedProjectRoot(), GitSyncPanel(), GitSyncPanelProps (+9 more)

### Community 50 - "build_codex_prompt"
Cohesion: 0.33
Nodes (3): build_codex_prompt(), build_planning_refinement_context(), BuildCodexPromptTests

### Community 51 - "load_daemon_config"
Cohesion: 0.22
Nodes (11): get_env_config_value(), get_optional_bool(), get_optional_positive_int(), get_poll_interval_ms(), load_daemon_config(), load_env_files(), load_parameter_file(), parse_env_line() (+3 more)

### Community 52 - "Planning Questionnaire"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Planning Questionnaire, Relevant Files, State Log, Summary

### Community 53 - "Recurrent Row Review Protocol"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Recurrent Row Review Protocol, Relevant Files, State Log, Summary

### Community 54 - "Frontend Supabase Config"
Cohesion: 0.29
Nodes (6): Dev Mode, Frontend Supabase Config, Key Points, Relevant Files, State Log, Summary

### Community 55 - "Ventures"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, Ventures

### Community 59 - "$defs"
Cohesion: 0.12
Nodes (16): additionalProperties, type, $defs, array_field_definition, field_definition, identifier, non_empty_string, system_definition (+8 more)

### Community 60 - "properties"
Cohesion: 0.15
Nodes (18): properties, object_field_definition, primitive_field_definition, $ref, additionalProperties, properties, type, additionalProperties (+10 more)

### Community 61 - "$ref"
Cohesion: 0.15
Nodes (14): items, type, items, type, $ref, properties, channels, fields (+6 more)

### Community 62 - "required"
Cohesion: 0.23
Nodes (14): fields, files, id, items, name, source_system_id, summary, target_system_id (+6 more)

### Community 63 - "run_codex_exec"
Cohesion: 0.26
Nodes (7): map_reasoning_for_codex(), Popen, register_agent_process(), run_codex_exec(), run_tracked_agent_command(), unregister_agent_process(), RunCodexExecTests

### Community 64 - "software-architecture-v1.schema.json"
Cohesion: 0.18
Nodes (10): channels, schema_version, systems, additionalProperties, description, $id, required, $schema (+2 more)

### Community 65 - "architecture.md"
Cohesion: 0.33
Nodes (5): 4-Stage Development Lifecycle, Evidence Extraction, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 66 - "entry-point-picker.tsx"
Cohesion: 0.29
Nodes (6): EntryPointPicker(), Props, getRelevantFileEntryPointSuggestions(), normalizeEntryPointPath(), ParameterFileProjects, ParameterFileRecord

### Community 67 - "integrating.md"
Cohesion: 0.40
Nodes (4): 4-Stage Development Lifecycle, Execution Boundaries (CRITICAL), Feature File Automation, Parameter File Centralization

### Community 68 - "update_execution_entry_point_in_toml"
Cohesion: 0.24
Nodes (7): apply_entry_point_update(), Path, split_toml_value_and_comment(), update_execution_entry_point_in_toml(), update_parameter_variable_in_toml(), EntryPointTomlUpdateTests, ParameterFileUpdateTests

### Community 71 - "Agent Task Notifications"
Cohesion: 0.29
Nodes (6): Agent Task Notifications, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 72 - "Auth-Scoped Supabase Access"
Cohesion: 0.29
Nodes (6): Auth-Scoped Supabase Access, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 73 - "Cursor Agent"
Cohesion: 0.29
Nodes (6): Cursor Agent, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 74 - "Daedalus Git Worktrees"
Cohesion: 0.29
Nodes (6): Daedalus Git Worktrees, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 75 - "Dev Environment Parameter File Loading"
Cohesion: 0.29
Nodes (6): Dev Environment Parameter File Loading, Dev Mode, Key Points, Relevant Files, State Log, Summary

### Community 76 - "Feature Execution System"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature Execution System, Key Points, Relevant Files, State Log, Summary

### Community 77 - "Feature File Communications System"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature File Communications System, Key Points, Relevant Files, State Log, Summary

### Community 78 - "Feature-File Graph Display"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature-File Graph Display, Key Points, Relevant Files, State Log, Summary

### Community 79 - "Feature Search / Fuzzy Finder"
Cohesion: 0.29
Nodes (6): Dev Mode, Feature Search / Fuzzy Finder, Key Points, Relevant Files, State Log, Summary

### Community 80 - "Git Sync"
Cohesion: 0.29
Nodes (6): Dev Mode, Git Sync, Key Points, Relevant Files, State Log, Summary

### Community 81 - "Local Daemon Feature File Scanner"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Feature File Scanner, Relevant Files, State Log, Summary

### Community 82 - "Local Daemon Manager"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Local Daemon Manager, Relevant Files, State Log, Summary

### Community 83 - "System Architecture Communication Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Communication Engine

### Community 84 - "System Architecture Visualization Engine"
Cohesion: 0.29
Nodes (6): Dev Mode, Key Points, Relevant Files, State Log, Summary, System Architecture Visualization Engine

### Community 87 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **365 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation`, `AgentPromptMode`, `AgentSessionPanelProps` (+360 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SupabaseUnavailableError` connect `orchestrator.py` to `FakeResponse`, `main.py`, `communications.py`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `GitWorktreeOrchestrator` connect `orchestrator.py` to `main.py`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `deploy_pending_migrations()` connect `planning-questionnaire.ts` to `orchestrator.py`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `DirectPromptSupervisor` and `SupabaseUnavailableError`) actually correct?**
  _`GitWorktreeOrchestrator` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `generate_architecture_view()` (e.g. with `.run_cycle()` and `.test_dedicated_codex_settings_and_read_only_generation()`) actually correct?**
  _`generate_architecture_view()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `SupabaseUnavailableError` (e.g. with `DirectPromptSupervisor` and `GitWorktreeOrchestrator`) actually correct?**
  _`SupabaseUnavailableError` has 15 INFERRED edges - model-reasoned connections that need verification._