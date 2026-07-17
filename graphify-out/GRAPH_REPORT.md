# Graph Report - batch-de42f513-83d8-4405-9a50-61beac599016  (2026-07-16)

## Corpus Check
- 122 files · ~91,191 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1131 nodes · 2000 edges · 80 communities (62 shown, 18 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 162 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `03b86307`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- orchestrator.py
- parameter-file-parser.ts
- feature-file-graph.tsx
- agent-output-viewer.tsx
- run_cursor_exec
- main.py
- dependencies
- feature-files-dashboard.tsx
- compilerOptions
- architecture.py
- scan_feature_file_projects
- communications.py
- main.py
- scan_feature_file_projects
- architecture-layout.ts
- update_execution_entry_point_in_toml
- run_parameter_file_poll_cycle
- page.tsx
- run_git_sync_cycle
- agent-task-notifications.tsx
- daemon-manager-panel.tsx
- recurrent-supabase-queries.test.ts
- layout.tsx
- Feature-First Graph Workspace Shell
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
- test_main.py
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
- __init__.py
- Path
- Path
- Path
- Popen
- Path

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 34 edges
2. `getAuthenticatedSupabaseHeaders()` - 31 edges
3. `FeatureFilesDashboard()` - 27 edges
4. `AgentOutputViewer()` - 18 edges
5. `generate_architecture_view()` - 18 edges
6. `call_daemon_rpc()` - 18 edges
7. `run_agent_prompt_cycle()` - 18 edges
8. `run_cursor_exec()` - 18 edges
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
- `DirectPromptSupervisor` --uses--> `FeatureExecutionSupervisor`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/execution.py

## Import Cycles
- None detected.

## Communities (80 total, 18 thin omitted)

### Community 0 - "orchestrator.py"
Cohesion: 0.07
Nodes (39): record_daemon_event(), update_agent_task(), upsert_orchestration_batch(), build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt(), commit_worktree_changes(), create_integration_worktree() (+31 more)

### Community 1 - "parameter-file-parser.ts"
Cohesion: 0.17
Nodes (20): ParameterVariableSelector(), ParameterVariableSelectorProps, ExecutionEntryPointMetadata, isDoubleQuotedString(), isSingleQuotedString(), isSupportedArrayLiteral(), isValidFloat(), normalizeFloatLiteral() (+12 more)

### Community 2 - "feature-file-graph.tsx"
Cohesion: 0.05
Nodes (51): applyNodeVisualMetrics(), applyZoomAtPoint(), buildGraphData(), buildProjectFeatureLayout(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor (+43 more)

### Community 3 - "agent-output-viewer.tsx"
Cohesion: 0.08
Nodes (51): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerPresentation, AgentOutputViewerProps, architectureActionLabel(), formatTime(), PlanningResponse(), activityTime() (+43 more)

### Community 4 - "run_cursor_exec"
Cohesion: 0.17
Nodes (9): is_cursor_plan_mode_unsupported(), parse_cursor_plan_stream(), parse_cursor_result(), Popen, register_agent_process(), run_cursor_exec(), run_tracked_agent_command(), unregister_agent_process() (+1 more)

### Community 5 - "main.py"
Cohesion: 0.13
Nodes (34): heartbeat_if_due(), main(), process_requested_restart(), Popen, recover_unexpected_exit(), request_shutdown(), start_execution_child(), start_stable_replacement() (+26 more)

### Community 6 - "dependencies"
Cohesion: 0.05
Nodes (40): eslint, eslint-config-next, fuse.js, next, react, react-dom, react-markdown, remark-gfm (+32 more)

### Community 7 - "feature-files-dashboard.tsx"
Cohesion: 0.06
Nodes (53): acknowledgeClientReviews(), AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, ClientReviewInbox, completeAgentTaskReview() (+45 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 9 - "architecture.py"
Cohesion: 0.07
Nodes (32): BaseModel, add_snapshot_worktree(), architecture_snapshot_path(), ArchitectureViewSupervisor, build_architecture_correction_prompt(), build_architecture_prompt(), classify_architecture_result(), collect_changed_files() (+24 more)

### Community 10 - "scan_feature_file_projects"
Cohesion: 0.10
Nodes (22): clampNumber(), FeatureFilesDashboard(), fetchActiveAgentTaskSummaries(), fetchDaemonPayload(), fetchFeatureExecutionHistorySummaries(), fetchFeatureExecutionHydration(), fetchFeatureExecutionRunDetail(), FINALIZED_AGENT_TASK_STATUSES (+14 more)

### Community 11 - "communications.py"
Cohesion: 0.07
Nodes (30): call_daemon_rpc(), claim_architecture_view(), claim_feature_execution_run(), complete_architecture_view(), fetch_communication_rows(), fetch_current_message(), fetch_current_messages(), fetch_work_snapshot() (+22 more)

### Community 12 - "main.py"
Cohesion: 0.16
Nodes (18): snapshot_communication_messages(), apply_entry_point_update(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), DirectPromptSupervisor, execute_git_sync_operation(), is_toml_float() (+10 more)

### Community 13 - "scan_feature_file_projects"
Cohesion: 0.09
Nodes (15): paired_parameter_file_path(), resolve_inside_project(), validate_execution_entry_point(), validate_execution_request(), find_project_directories(), is_linked_git_worktree(), load_snapshot_limits(), Read one explicitly requested file within its project and response bound. (+7 more)

### Community 16 - "architecture-layout.ts"
Cohesion: 0.11
Nodes (28): ArchitectureVisualization(), ArchitectureVisualizationProps, truncate(), wrapName(), boxEdgeConnectionPoints(), canvasBounds(), channelLabelPosition(), ChannelLayout (+20 more)

### Community 19 - "update_execution_entry_point_in_toml"
Cohesion: 0.24
Nodes (7): apply_parameter_file_update(), Path, split_toml_value_and_comment(), update_execution_entry_point_in_toml(), update_parameter_variable_in_toml(), EntryPointTomlUpdateTests, ParameterFileUpdateTests

### Community 21 - "run_parameter_file_poll_cycle"
Cohesion: 0.27
Nodes (5): run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), RunParameterFilePollCycleTests, RunPollCycleTests

### Community 22 - "page.tsx"
Cohesion: 0.16
Nodes (10): AgentPromptMode, AgentSessionPanelProps, Home(), AgentChatExchange, TargetedFeature, AgentModel, AgentModelsConfig, loadAgentModels() (+2 more)

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
Cohesion: 0.22
Nodes (7): architectureViewSource, daemonMainSource, dashboardSource, historySource, managerSource, migrationSource, visualizationMigrationSource

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
Cohesion: 0.16
Nodes (17): FeatureGraphSelection, FeatureSearchDialog(), FeatureSearchDialogProps, FeatureSearchMode, buildFeatureExecutionRequest(), buildFeatureSearchRecords(), FeatureSearchRecord, getFeatureNameFromMarkdown() (+9 more)

### Community 46 - "README.md"
Cohesion: 0.10
Nodes (20): 1. Daedalus Site, 2. Backend, 3. Persistent Idea Space, 4. Local Daemon, 5. AI Execution Layer, Core Subsystems, Daedalus, Design Philosophy (+12 more)

### Community 48 - "run_agent_prompt_cycle"
Cohesion: 0.19
Nodes (6): build_agent_prompt_state_message(), parse_agent_prompt_message(), run_agent_prompt_cycle(), AgentOutputHistoryPublicationTests, CursorProviderRoutingTests, RunAgentPromptCycleTests

### Community 49 - "getProjectLabel"
Cohesion: 0.22
Nodes (13): AgentSessionPanel(), getCompactProjectLabel(), getProjectLabel(), getSharedProjectRoot(), GitSyncPanel(), GitSyncPanelProps, GitSyncOperation, GitSyncResult (+5 more)

### Community 50 - "build_codex_prompt"
Cohesion: 0.26
Nodes (4): build_codex_prompt(), build_cursor_prompt(), build_planning_refinement_context(), BuildCodexPromptTests

### Community 51 - "load_daemon_config"
Cohesion: 0.22
Nodes (10): resolve_cursor_api_key(), get_env_config_value(), get_optional_bool(), get_optional_positive_int(), get_poll_interval_ms(), load_daemon_config(), load_env_files(), load_parameter_file() (+2 more)

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
Cohesion: 0.13
Nodes (16): boolean, integer, null, number, string, properties, primitive_field_definition, additionalProperties (+8 more)

### Community 59 - "$defs"
Cohesion: 0.12
Nodes (16): additionalProperties, type, additionalProperties, type, $defs, array_field_definition, channel_definition, field_definition (+8 more)

### Community 60 - "properties"
Cohesion: 0.15
Nodes (15): properties, system_definition, $ref, $ref, id, name, source_system_id, summary (+7 more)

### Community 61 - "$ref"
Cohesion: 0.14
Nodes (15): items, type, items, type, uniqueItems, $ref, properties, channels (+7 more)

### Community 62 - "required"
Cohesion: 0.23
Nodes (14): fields, files, id, items, name, source_system_id, summary, target_system_id (+6 more)

### Community 63 - "test_main.py"
Cohesion: 0.16
Nodes (7): filter_targeted_feature_paths(), map_reasoning_for_codex(), run_codex_exec(), FakeGitProcess, FilterTargetedFeaturePathsTests, RunCodexExecTests, RunParameterFileUpdateCycleTests

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
Cohesion: 0.29
Nodes (7): object_field_definition, items, type, additionalProperties, properties, type, fields

### Community 87 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **331 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation`, `AgentPromptMode`, `AgentSessionPanelProps` (+326 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GitWorktreeOrchestrator` connect `orchestrator.py` to `main.py`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `FeatureExecutionSupervisor` connect `communications.py` to `main.py`, `scan_feature_file_projects`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `load_daemon_config()` connect `load_daemon_config` to `main.py`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `DirectPromptSupervisor` and `CancelOrchestratorTests`) actually correct?**
  _`GitWorktreeOrchestrator` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `generate_architecture_view()` (e.g. with `.run_cycle()` and `.test_dedicated_codex_settings_and_read_only_generation()`) actually correct?**
  _`generate_architecture_view()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentOutputViewerPresentation` to the rest of the system?**
  _331 weakly-connected nodes found - possible documentation gaps or missing edges._