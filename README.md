# Daedalus

## Vision

Daedalus is an AI-enhanced software workspace for builders.

The goal is **not** to create another AI chatbot or IDE. The goal is to build a persistent operating system for software development that understands the state of every project, the relationships between projects, and can coordinate AI agents to perform work while keeping the human in control.

Traditional AI coding tools are largely stateless—they receive a prompt, operate on a repository, and return a result. Daedalus instead maintains long-lived knowledge about projects and uses that knowledge to provide richer context to AI agents.

Ultimately, Daedalus should become a central workspace where a user can:

* Track every project they are building.
* Understand dependencies between services and components.
* View current progress and outstanding work.
* Launch AI agents to implement features or investigate bugs.
* Execute local workflows from a browser or mobile device.
* Maintain a persistent "idea space" that grows over time.

The long-term vision is that Daedalus becomes a developer's personal operating system.

---

# Why

As projects grow, the largest source of friction is not writing code—it is remembering context.

Examples include:

* What services exist?
* Which subsystem owns a particular feature?
* What bugs are currently being investigated?
* Which ideas were abandoned?
* Which services share components?
* What commands are required to run a particular project?
* Which AI prompt previously solved a similar issue?

Today this information is scattered across:

* GitHub Issues
* README files
* Notes
* TODO comments
* Chat history
* Memory

Daedalus exists to consolidate this information into one structured system that both humans and AI agents can understand.

---

# Design Philosophy

Daedalus is **state-first**, not **chat-first**.

The database is the source of truth.

AI agents are consumers and producers of that state—not owners of it.

The human always owns the final decision.

Every subsystem should be designed so that replacing the underlying AI model (Codex, Claude Code, Cursor, etc.) requires minimal changes.

---

# High-Level Architecture

```
User
    │
    ▼
Daedalus Site
    │
    ▼
Daedalus Backend
    │
    ▼
Persistent Idea Space
    │
    ▼
Task Generation
    │
    ▼
Local Daemon
    │
    ▼
OpenClaw / Coding Agent
    │
    ▼
Local Repository
```

The frontend visualizes state.

The backend manages state.

The daemon performs actions.

AI agents execute implementation work.

---

# Core Subsystems

## 1. Daedalus Site

Purpose:

Provide the primary interface for interacting with the workspace.

Responsibilities:

* Service catalog
* Issue management
* Feature planning
* Graph visualization
* Agent run history
* Chat interface
* Mobile compatibility
* User authentication

This should remain lightweight.

Business logic belongs in the backend.

---

## 2. Backend

Purpose:

Coordinate every subsystem.

Responsibilities:

* Store workspace state
* Parse user intent
* Generate structured tasks
* Manage agent runs
* Authenticate users
* Synchronize connected devices
* Broadcast work to local daemons

The backend is the system's control plane.

---

## 3. Persistent Idea Space

Purpose:

Represent software as structured knowledge.

Potential entities include:

* Services
* Components
* Features
* Bugs
* Tasks
* Commands
* Repositories
* APIs
* Databases
* Relationships
* Agent runs
* Documentation
* Notes

Relationships are first-class objects.

Example:

```
Trading Bot
    uses
Kalshi API

Trading Bot
    depends_on
Order Manager

Order Manager
    owns
Position Reconciliation
```

---

## 4. Local Daemon

Purpose:

Bridge the cloud application to the user's local computer.

Responsibilities:

* Authenticate with backend
* Maintain persistent connection
* Receive tasks
* Execute approved commands
* Launch AI coding agents
* Stream progress
* Return results

The daemon should never own project state.

It only performs work.

---

## 5. AI Execution Layer

The execution layer is intentionally replaceable.

Potential providers include:

* Codex
* Claude Code
* Cursor
* OpenCode
* OpenClaw
* Future coding agents

Daedalus should interact with them through a common interface whenever possible.

---

# Typical Workflow

1. User requests work.

2. Backend interprets intent.

3. Workspace state is updated.

4. Backend generates a structured task.

5. Task is sent to the user's connected daemon.

6. Daemon launches an AI coding agent.

7. Agent edits code and runs tests.

8. Results stream back to the backend.

9. Frontend updates in real time.

---

# Guiding Principles

## Human-in-the-loop

AI should accelerate development, not replace judgment.

Critical operations should require explicit approval.

---

## Structured context over prompt engineering

Rather than constructing larger prompts, Daedalus should provide richer structured information.

Examples:

* active bugs
* architecture
* dependency graph
* recent logs
* previous agent runs
* feature ownership

---

## Replaceable AI providers

The system should never depend on one vendor.

Changing the coding agent should require changing an adapter, not the application.

---

## Local-first execution

Code should remain on the user's machine whenever possible.

The backend coordinates.

The daemon executes.

---

## Persistent memory

Unlike chat history, workspace knowledge should accumulate over months or years.

Projects should become increasingly understandable as they evolve.

---

# Near-Term Goals (MVP)

The first milestone is intentionally small.

* Service catalog
* Basic project dashboard
* Issue tracker
* Local daemon connection
* Task dispatch
* AI agent launch
* Live execution logs

Everything else can be layered on top after this foundation is stable.

---

# Long-Term Vision

Daedalus should eventually feel less like an IDE and more like an operating system for software creation.

The user should be able to switch between projects, devices, and AI providers without losing context.

The workspace should understand what is being built, why it exists, what remains to be done, and which agent is best suited to perform the next task.

The objective is not autonomous software development.

The objective is reducing the cognitive overhead of building complex systems.

