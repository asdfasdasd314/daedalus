# Graph Report - daedalus  (2026-07-17)

## Corpus Check
- 129 files · ~102,926 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1181 nodes · 2172 edges · 80 communities (66 shown, 14 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 172 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ed514a5a`
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
- execution.py
- architecture-view.ts
- SupabaseUnavailableError
- FeatureExecutionSupervisor
- update_execution_entry_point_in_toml
- FakeResponse
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
- AGENTS.md
- Document Icon
- Globe Icon
- Next.js Logo
- Vercel Logo
- Browser Window Icon
- Next.js Project
- feature-workspace-utils.ts
- README.md
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
- properties
- $defs
- properties
- $ref
- required
- run_codex_exec
- software-architecture-v1.schema.json
- entry-point-picker.tsx
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
- properties
- README.md

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 44 edges
2. `FeatureFilesDashboard()` - 31 edges
3. `getAuthenticatedSupabaseHeaders()` - 31 edges
4. `call_daemon_rpc()` - 24 edges
5. `AgentOutputViewer()` - 20 edges
6. `generate_architecture_view()` - 20 edges
7. `run_agent_prompt_cycle()` - 19 edges
8. `run_cursor_exec()` - 19 edges
9. `main()` - 18 edges
10. `compilerOptions` - 16 edges

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

## Communities (80 total, 14 thin omitted)

### Community 0 - "orchestrator.py"
Cohesion: 0.06
Nodes (43): record_daemon_event(), update_agent_task(), upsert_orchestration_batch(), build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt(), commit_worktree_changes(), create_integration_worktree() (+35 more)

### Community 1 - "parameter-file-parser.ts"
Cohesion: 0.17
Nodes (20): ParameterVariableSelector(), ParameterVariableSelectorProps, ExecutionEntryPointMetadata, isDoubleQuotedString(), isSingleQuotedString(), isSupportedArrayLiteral(), isValidFloat(), normalizeFloatLiteral() (+12 more)

### Community 2 - "feature-file-graph.tsx"
Cohesion: 0.05
Nodes (51): applyNodeVisualMetrics(), applyZoomAtPoint(), buildGraphData(), buildProjectFeatureLayout(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor (+43 more)

### Community 3 - "agent-output-viewer.tsx"
Cohesion: 0.09
Nodes (49): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerPresentation, AgentOutputViewerProps, architectureActionLabel(), architectureProgressLabel(), formatTime(), integrationBatchStatusLabel() (+41 more)

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
Cohesion: 0.04
Nodes (79): acknowledgeClientReviews(), AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, BatchDeletionRequestRow, callRecoveryRpc() (+71 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 9 - "architecture.py"
Cohesion: 0.06
Nodes (36): BaseModel, add_snapshot_worktree(), architecture_failure_details(), architecture_operational_failure(), architecture_snapshot_path(), ArchitectureViewSupervisor, build_architecture_correction_prompt(), build_architecture_prompt() (+28 more)

### Community 10 - "scan_feature_file_projects"
Cohesion: 0.15
Nodes (11): find_project_directories(), is_linked_git_worktree(), load_snapshot_limits(), Path, Read one explicitly requested file within its project and response bound., read_project_file(), scan_feature_file_projects(), scan_parameter_file_projects() (+3 more)

### Community 11 - "UpdateCurrentMessageTests"
Cohesion: 0.15
Nodes (6): fetch_communication_rows(), fetch_current_message(), fetch_work_snapshot(), Fetch and normalize the single bounded recurrent response for a cycle., upsert_agent_output_history(), UpdateCurrentMessageTests

### Community 12 - "main.py"
Cohesion: 0.17
Nodes (17): snapshot_communication_messages(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), DirectPromptSupervisor, execute_git_sync_operation(), is_toml_float(), is_toml_string() (+9 more)

### Community 13 - "communications.py"
Cohesion: 0.19
Nodes (17): call_daemon_rpc(), claim_architecture_view(), claim_feature_execution_run(), complete_architecture_view(), complete_batch_deletion(), complete_task_deletion(), delete_orchestration_batch(), fetch_current_messages() (+9 more)

### Community 14 - "planning-questionnaire.ts"
Cohesion: 0.17
Nodes (11): PlanningResponse(), AgentChatExchange, TargetedFeature, buildImplementationPrompt(), buildPlanningAnswersSuffix(), parsePlanningReply(), parseQuestionSection(), PlanningAnswer (+3 more)

### Community 15 - "execution.py"
Cohesion: 0.25
Nodes (6): paired_parameter_file_path(), Path, resolve_inside_project(), validate_execution_entry_point(), validate_execution_request(), ExecutionContractTests

### Community 16 - "architecture-view.ts"
Cohesion: 0.09
Nodes (35): architectureFailureDetail(), ArchitectureProgressStepper(), ArchitectureVisualization(), ArchitectureVisualizationProps, PROGRESS_PHASES, stageOrder(), truncate(), wrapName() (+27 more)

### Community 17 - "SupabaseUnavailableError"
Cohesion: 0.18
Nodes (9): get_supabase_headers(), open_supabase_request(), post_feature_files(), post_parameter_files(), Exception, SupabaseUnavailableError, update_current_message(), upsert_daemon_payload() (+1 more)

### Community 18 - "FeatureExecutionSupervisor"
Cohesion: 0.38
Nodes (3): update_feature_execution_run(), FeatureExecutionSupervisor, Popen

### Community 19 - "update_execution_entry_point_in_toml"
Cohesion: 0.23
Nodes (8): apply_entry_point_update(), apply_parameter_file_update(), Path, split_toml_value_and_comment(), update_execution_entry_point_in_toml(), update_parameter_variable_in_toml(), EntryPointTomlUpdateTests, ParameterFileUpdateTests

### Community 21 - "__init__.py"
Cohesion: 0.23
Nodes (6): post_git_sync_result(), run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), RunParameterFilePollCycleTests, RunPollCycleTests

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
Cohesion: 0.15
Nodes (11): architectureViewSource, batchRetryMigrationSource, daemonMainSource, dashboardSource, historySource, managerSource, migrationSource, orchestratorSource (+3 more)

### Community 27 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 28 - "Feature-First Graph Workspace Shell"
Cohesion: 0.09
Nodes (20): Agent Output Viewer, Dev Mode, Key Points, Relevant Files, State Log, Summary, Agent Prompt Chat, Dev Mode (+12 more)

### Community 38 - "AGENTS.md"
Cohesion: 0.50
Nodes (3): Daedalus Agent Instructions, graphify, Recurrent Supabase Reads

### Community 45 - "feature-workspace-utils.ts"
Cohesion: 0.15
Nodes (18): FeatureGraphSelection, FeatureSearchDialog(), FeatureSearchDialogProps, FeatureSearchMode, buildFeatureExecutionRequest(), buildFeatureSearchRecords(), FeatureSearchRecord, getFeatureNameFromMarkdown() (+10 more)

### Community 46 - "README.md"
Cohesion: 0.10
Nodes (20): 1. Daedalus Site, 2. Backend, 3. Persistent Idea Space, 4. Local Daemon, 5. AI Execution Layer, Core Subsystems, Daedalus, Design Philosophy (+12 more)

### Community 48 - "run_agent_prompt_cycle"
Cohesion: 0.12
Nodes (10): build_agent_prompt_state_message(), filter_targeted_feature_paths(), parse_agent_prompt_message(), run_agent_prompt_cycle(), AgentOutputHistoryPublicationTests, CursorProviderRoutingTests, FakeGitProcess, FilterTargetedFeaturePathsTests (+2 more)

### Community 49 - "getProjectLabel"
Cohesion: 0.20
Nodes (14): AgentPromptMode, AgentSessionPanel(), AgentSessionPanelProps, getCompactProjectLabel(), getProjectLabel(), GitSyncPanel(), GitSyncPanelProps, GitSyncOperation (+6 more)

### Community 50 - "build_codex_prompt"
Cohesion: 0.26
Nodes (4): build_codex_prompt(), build_cursor_prompt(), build_planning_refinement_context(), BuildCodexPromptTests

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

### Community 58 - "properties"
Cohesion: 0.17
Nodes (12): boolean, integer, null, number, string, additionalProperties, properties, type (+4 more)

### Community 59 - "$defs"
Cohesion: 0.12
Nodes (16): additionalProperties, type, $defs, channel_definition, field_definition, identifier, non_empty_string, system_definition (+8 more)

### Community 60 - "properties"
Cohesion: 0.15
Nodes (16): properties, primitive_field_definition, $ref, $ref, additionalProperties, properties, type, id (+8 more)

### Community 61 - "$ref"
Cohesion: 0.14
Nodes (15): items, type, items, type, uniqueItems, $ref, properties, channels (+7 more)

### Community 62 - "required"
Cohesion: 0.23
Nodes (14): fields, files, id, items, name, source_system_id, summary, target_system_id (+6 more)

### Community 63 - "run_codex_exec"
Cohesion: 0.27
Nodes (7): map_reasoning_for_codex(), Popen, register_agent_process(), run_codex_exec(), run_tracked_agent_command(), unregister_agent_process(), RunCodexExecTests

### Community 64 - "software-architecture-v1.schema.json"
Cohesion: 0.18
Nodes (10): channels, schema_version, systems, additionalProperties, description, $id, required, $schema (+2 more)

### Community 66 - "entry-point-picker.tsx"
Cohesion: 0.29
Nodes (6): EntryPointPicker(), Props, getRelevantFileEntryPointSuggestions(), normalizeEntryPointPath(), ParameterFileProjects, ParameterFileRecord

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

### Community 86 - "properties"
Cohesion: 0.20
Nodes (10): object_field_definition, items, type, additionalProperties, properties, type, fields, required (+2 more)

### Community 87 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **340 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation`, `AgentPromptMode`, `AgentSessionPanelProps` (+335 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GitWorktreeOrchestrator` connect `orchestrator.py` to `main.py`, `__init__.py`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `load_daemon_config()` connect `load_daemon_config` to `main.py`, `__init__.py`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `DirectPromptSupervisor` and `BatchCompletionDeliveryTests`) actually correct?**
  _`GitWorktreeOrchestrator` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation` to the rest of the system?**
  _340 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `orchestrator.py` be split into smaller, more focused modules?**
  _Cohesion score 0.061872909698996656 - nodes in this community are weakly interconnected._
- **Should `feature-file-graph.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.052600818234950324 - nodes in this community are weakly interconnected._