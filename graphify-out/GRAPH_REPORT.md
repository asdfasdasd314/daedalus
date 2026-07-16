# Graph Report - .  (2026-07-16)

## Corpus Check
- 114 files · ~77,705 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 770 nodes · 1549 edges · 58 communities (32 shown, 26 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 133 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57

## God Nodes (most connected - your core abstractions)
1. `GitWorktreeOrchestrator` - 34 edges
2. `getAuthenticatedSupabaseHeaders()` - 31 edges
3. `FeatureFilesDashboard()` - 26 edges
4. `run_agent_prompt_cycle()` - 19 edges
5. `run_cursor_exec()` - 19 edges
6. `main()` - 17 edges
7. `AgentOutputViewer()` - 16 edges
8. `compilerOptions` - 16 edges
9. `call_daemon_rpc()` - 16 edges
10. `call_manager_rpc()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `FeatureFilesDashboard()` --indirect_call--> `exchange()`  [INFERRED]
  daedalus-site/app/feature-files-dashboard.tsx → daedalus-site/lib/agent-output-history.test.ts
- `DirectPromptSupervisor` --uses--> `SupabaseUnavailableError`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/communications.py
- `DirectPromptSupervisor` --uses--> `FeatureExecutionSupervisor`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/execution.py
- `DirectPromptSupervisor` --uses--> `GitWorktreeOrchestrator`  [INFERRED]
  local-daemon/src/daedalus_daemon/main.py → local-daemon/src/daedalus_daemon/orchestrator.py
- `AgentOutputViewer()` --calls--> `getProjectLabel()`  [EXTRACTED]
  daedalus-site/app/agent-output-viewer.tsx → daedalus-site/app/feature-workspace-utils.ts

## Import Cycles
- None detected.

## Communities (58 total, 26 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (39): record_daemon_event(), update_agent_task(), upsert_orchestration_batch(), build_resolver_prompt(), build_task_prompt(), build_task_repair_prompt(), commit_worktree_changes(), create_integration_worktree() (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (57): AgentPromptMode, AgentSessionPanel(), AgentSessionPanelProps, EntryPointPicker(), Props, extractFeatureFileReferences(), FeatureGraphSelection, FeatureSearchDialog() (+49 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (50): applyNodeVisualMetrics(), applyZoomAtPoint(), buildGraphData(), buildProjectFeatureLayout(), centerGraphViewport(), clamp(), ClientPoint, ClusterColor (+42 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (42): AgentOutputDetailProps, AgentOutputViewer(), AgentOutputViewerProps, formatTime(), activityTime(), AGENT_OUTPUT_MODE_LABELS, AGENT_OUTPUT_SOURCE_LABELS, AGENT_OUTPUT_STATUS_LABELS (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (19): build_agent_prompt_state_message(), build_codex_prompt(), build_cursor_prompt(), build_planning_refinement_context(), filter_targeted_feature_paths(), is_cursor_plan_mode_unsupported(), parse_agent_prompt_message(), parse_cursor_plan_stream() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (35): acquire_lease(), begin_restart(), call_manager_rpc(), claim_restart(), complete_control_request(), complete_recovery(), complete_restart(), get_active_request() (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (40): dependencies, fuse.js, next, react, react-dom, react-markdown, remark-gfm, @supabase/supabase-js (+32 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (26): AgentPromptPayload, AgentPromptQueueEntry, AgentPromptQueueStatus, AgentTaskRow, AuthMode, ClientReviewInbox, DaemonEventRow, DaemonPayloadRow (+18 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (28): acknowledgeClientReviews(), completeAgentTaskReview(), completeCommunicationReview(), completeDaemonEventReview(), completeDaemonPayloadReview(), completeFeatureExecutionReview(), createVenture(), deleteAgentTaskRow() (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (11): find_project_directories(), is_linked_git_worktree(), load_snapshot_limits(), Path, Read one explicitly requested file within its project and response bound., read_project_file(), scan_feature_file_projects(), scan_parameter_file_projects() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.15
Nodes (22): Exception, call_daemon_rpc(), claim_feature_execution_run(), fetch_communication_rows(), fetch_current_messages(), fetch_work_snapshot(), get_agent_task_control(), get_supabase_headers() (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (17): snapshot_communication_messages(), build_entry_point_update_state_message(), build_parameter_file_update_state_message(), build_skipped_push_step(), DirectPromptSupervisor, execute_git_sync_operation(), is_toml_float(), is_toml_string() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (19): clampNumber(), FeatureFilesDashboard(), fetchActiveAgentTaskSummaries(), fetchDaemonPayload(), fetchFeatureExecutionHistorySummaries(), fetchFeatureExecutionHydration(), fetchFeatureExecutionRunDetail(), findParameterFileByPath() (+11 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (11): get_env_config_value(), get_optional_bool(), get_optional_positive_int(), get_poll_interval_ms(), load_daemon_config(), load_env_files(), load_parameter_file(), parse_env_line() (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.17
Nodes (11): PlanningResponse(), AgentChatExchange, TargetedFeature, buildImplementationPrompt(), buildPlanningAnswersSuffix(), parsePlanningReply(), parseQuestionSection(), PlanningAnswer (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (3): fetch_current_message(), upsert_agent_output_history(), UpdateCurrentMessageTests

### Community 17 - "Community 17"
Cohesion: 0.28
Nodes (3): update_feature_execution_run(), FeatureExecutionSupervisor, Popen

### Community 18 - "Community 18"
Cohesion: 0.26
Nodes (6): paired_parameter_file_path(), Path, resolve_inside_project(), validate_execution_entry_point(), validate_execution_request(), ExecutionContractTests

### Community 19 - "Community 19"
Cohesion: 0.23
Nodes (8): apply_entry_point_update(), apply_parameter_file_update(), Path, split_toml_value_and_comment(), update_execution_entry_point_in_toml(), update_parameter_variable_in_toml(), EntryPointTomlUpdateTests, ParameterFileUpdateTests

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (7): map_reasoning_for_codex(), Popen, register_agent_process(), run_codex_exec(), run_tracked_agent_command(), unregister_agent_process(), RunCodexExecTests

### Community 21 - "Community 21"
Cohesion: 0.27
Nodes (5): run_parameter_file_poll_cycle(), run_poll_cycle(), run_project_load_cycle(), RunParameterFilePollCycleTests, RunPollCycleTests

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (6): Home(), AgentModel, AgentModelsConfig, loadAgentModels(), FrontendConfig, loadFrontendConfig()

### Community 23 - "Community 23"
Cohesion: 0.39
Nodes (3): parse_git_sync_message(), run_git_sync_cycle(), RunGitSyncCycleTests

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (6): AgentTaskNotification, AgentTaskNotifications(), AgentTaskNotificationsProps, AgentTaskNotificationStatus, formatRelativeTime(), STATUS_LABELS

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (5): DaemonManagerPanel(), DaemonManagerRequest, DaemonManagerStatus, formatTime(), Props

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (5): daemonMainSource, dashboardSource, historySource, managerSource, migrationSource

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 28 - "Community 28"
Cohesion: 0.50
Nodes (5): Agent Output Viewer, Agent Prompt Chat, Feature File Graph Display, Feature-First Graph Workspace Shell, Feature Search Fuzzy Finder

## Knowledge Gaps
- **154 isolated node(s):** `AgentOutputDetailProps`, `AgentOutputViewerProps`, `AgentPromptMode`, `AgentSessionPanelProps`, `AgentTaskNotificationStatus` (+149 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GitWorktreeOrchestrator` connect `Community 0` to `Community 17`, `Community 12`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `run_cursor_exec()` connect `Community 4` to `Community 17`, `Community 12`, `Community 20`, `Community 14`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `scan_feature_file_projects()` connect `Community 10` to `Community 17`, `Community 12`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `GitWorktreeOrchestrator` (e.g. with `DirectPromptSupervisor` and `CancelOrchestratorTests`) actually correct?**
  _`GitWorktreeOrchestrator` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureFilesDashboard()` (e.g. with `mapAgentTaskRowToQueueEntry()` and `exchange()`) actually correct?**
  _`FeatureFilesDashboard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `run_agent_prompt_cycle()` (e.g. with `.run_cycle()` and `.test_publishes_provider_exception_as_separate_terminal_error()`) actually correct?**
  _`run_agent_prompt_cycle()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `run_cursor_exec()` (e.g. with `main()` and `.test_falls_back_when_cursor_rejects_plan_mode()`) actually correct?**
  _`run_cursor_exec()` has 11 INFERRED edges - model-reasoned connections that need verification._