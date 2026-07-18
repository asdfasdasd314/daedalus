# System Architecture Visualization Engine

## Summary
The System Architecture Visualization Engine publishes and validates a recursive software-architecture JSON contract, persists normalized structured documents, and renders deterministic SVG system-and-channel diagrams with a durable Architecture View progress stepper in the authenticated workspace.

## Key Points
- **Single Public Contract**: The daemon prompt, Pydantic models, database payload, and frontend types share the version `1.0` software-architecture document shape.
- **Strict Validation**: Undeclared properties, invalid identifiers, duplicate graph entities, duplicate system files, and unknown channel endpoints are rejected before persistence.
- **Bounded Correction**: Schema or validation failures receive complete corrective prompts for at most three total model invocations; operational failures stop immediately.
- **Structured-Only Persistence**: Only normalized JSON documents are stored, while legacy Markdown is neither migrated nor rendered.
- **Navigable Diagramming**: Document order drives deterministic grid placement, box-edge connections, parallel offsets, self loops, and SVG bounds inside a fitted pan-and-zoom viewport.
- **Connection Inspection**: Channels stay visually quiet until their wide hover or keyboard-focus target highlights the path and reveals screen-stable direction, summary, and field details.
- **Visible Generation Progress**: The canvas merges only current-generation stage events and shows completed, active, pending, failed, and document-correction retry states.

## Relevant Files
- `shared/schemas/software-architecture-v1.schema.json`: Published JSON Schema used as the model prompt contract.
- `local-daemon/src/daedalus_daemon/architecture_document.py`: Strict Pydantic models and corrective validation details.
- `supabase/migrations/029_system_architecture_visualization_engine.sql`: Structured Architecture View persistence transition.
- `daedalus-site/lib/architecture-view.ts`: Recursive frontend document types and Architecture View transport.
- `daedalus-site/lib/architecture-layout.ts`: Pure deterministic layout helpers.
- `daedalus-site/app/architecture-visualization.tsx`: Architecture canvas states and SVG renderer.
- `parameter_files/system-architecture-visualization-engine.toml`: Validation-attempt limit.

## Dev Mode
HACKING

## State Log
- 2026-07-16: Initialized the structured architecture contract, strict validation boundary, JSON persistence payload, and deterministic SVG rendering ownership.
- 2026-07-16: Implemented the published recursive schema, strict Pydantic normalization and three-attempt correction, structured database payload, frontend types, pure layout helpers, and accessible SVG canvas states.
- 2026-07-17: Rendered persisted Architecture View failure stage, exception type, and traceback details in the visualization error state for actionable regeneration diagnostics.
- 2026-07-17: Added a generation-aware durable progress stepper that exposes snapshot, evidence, document validation, correction retries, and finalization while retaining the existing terminal canvas actions.
- 2026-07-17: Resolved the integration by displaying durable progress alongside persisted architecture-generation failure diagnostics.
- 2026-07-17: Added repository-local raw architecture JSON artifacts and per-attempt prompt/response logs so validation failures can be inspected without relying on terminal formatting.
- 2026-07-18: Replaced the fixed scrollable architecture SVG with a fitted pannable and zoomable viewport and moved channel labels into accessible hover/focus detail cards.
- 2026-07-18: Guarded the deferred viewport-resize measurement against a cleared SVG ref so the client component type-checks during production builds.
