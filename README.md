# Echelon

<p align="center">
  <img src="https://img.shields.io/badge/Deno-%23000000?logo=deno&logoColor=white" alt="Deno badge" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript badge" />
  <img src="https://img.shields.io/badge/Deno%20KV-ready-5865F2?logo=deno&logoColor=white" alt="Deno KV badge" />
  <img src="https://img.shields.io/badge/Telemetry-Prometheus-FF6F61?logo=prometheus&logoColor=white" alt="Prometheus badge" />
  <img src="https://img.shields.io/badge/WASM-enabled-0A7EA4?logo=webassembly&logoColor=white" alt="WASM badge" />
  <img src="https://img.shields.io/badge/Style-deno%20fmt%20%7C%20deno%20lint-4A90E2?logo=deno&logoColor=white" alt="Deno fmt badge" />
</p>

Echelon is an Application Operating System–style web framework built entirely on Deno. It treats the full stack—runtime, HTTP, middleware, routing, data, auth, security, telemetry, and WASM—like OS layers, emphasizing minimal dependencies, type safety, and secure defaults inspired by Deno's permission model. “Batteries included” means you get routing, middleware, KV-backed ORM, RBAC-aware auth, caching, job scheduling, telemetry, plugins, and WASM execution without adding third-party packages.

## Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Routes & Live Checks](#routes--live-checks)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Application OS Design](#application-os-design)
- [Features](#features)
- [Project Layout](#project-layout)
- [Development Tasks](#development-tasks)

## Overview
- **Application OS mindset:** Echelon abstracts the web stack the way an operating system abstracts hardware, layering runtime, routing, data, auth, and telemetry into cohesive modules with RBAC and admin capabilities as first-class citizens.【F:docs/planning/RuntimeLayer.md†L9-L45】
- **Secure, Deno-native foundation:** The boot sequence uses Deno's configuration loader, permission checks, and KV store before wiring routes and starting the server, keeping permissions explicit and minimal.【F:main.ts†L14-L38】
- **Observable by default:** Built-in telemetry surfaces metrics in Prometheus format and ships a debugger hook for lifecycle insights.【F:src/routes/api.ts†L45-L50】

## Quick Start
1. **Install Deno** from [deno.land](https://deno.land/#installation).
2. **Run in watch mode** during development:
   ```sh
   deno task dev
   ```
3. **Run with minimal permissions** for local usage:
   ```sh
   deno task start
   ```
4. The server logs the startup URL and listens on `http://localhost:8000` by default (configurable via `port`).【F:main.ts†L32-L38】

## Routes & Live Checks
- `GET /` – Gradient-themed landing page linking to API checks.【F:src/routes/home.ts†L14-L86】
- `GET /about` – Overview of Echelon and its feature pillars.【F:src/routes/home.ts†L89-L142】
- `GET /api/health` – Health snapshot with uptime seconds.【F:src/routes/api.ts†L11-L23】
- `GET /api/info` – Runtime details (framework, Deno, TypeScript, V8 versions).【F:src/routes/api.ts†L25-L40】
- `GET /api/metrics` – Prometheus-formatted telemetry from the metrics registry.【F:src/routes/api.ts†L42-L50】
- `GET /api/echo/:message` – Path-parameter echo demo.【F:src/routes/api.ts†L52-L64】
- `POST /api/echo` – JSON echo with validation and error handling.【F:src/routes/api.ts†L66-L85】

## Architecture at a Glance
- **Boot flow:** load configuration → check permissions → open Deno KV → create `Application` → initialize plugins/telemetry → register routes → start the HTTP server.【F:main.ts†L14-L38】
- **Routing:** routes are composed through a shared `Router` and registered via `registerRoutes`, providing default 404/error handlers you can override.【F:src/routes/mod.ts†L11-L29】
- **Data layer:** example `User` model demonstrates Deno KV persistence, validation, indexed queries, and safe serialization that omits passwords.【F:src/models/user.ts†L1-L102】

## Features
- **Deno-first:** Zero/low external dependencies, leveraging standard Web APIs, KV, and permissions.【F:docs/planning/RuntimeLayer.md†L9-L74】
- **TypeScript everywhere:** Strict compiler settings with JSX support for future view layers.【F:deno.json†L21-L26】
- **Secure by design:** Permission checks are part of the startup contract; harden further by extending `checkPermissions` requirements.【F:main.ts†L17-L38】
- **Telemetry built in:** Metrics registry exposed at `/api/metrics`, plus health/info endpoints for quick diagnostics.【F:src/routes/api.ts†L11-L50】
- **WASM-ready & pluggable:** Framework layers include WASM runtime hooks and plugin scaffolding to extend the Application OS model.【F:docs/planning/RuntimeLayer.md†L27-L74】

## Application OS Design
Echelon is structured like an operating system for web apps, with layers that cooperate but stay decoupled so features can be enabled, replaced, or composed as needed.【F:docs/planning/RuntimeLayer.md†L9-L107】 Here’s how the batteries snap together:

- **Runtime core (Layer 0):** Manages lifecycle and permission checks while initializing Deno KV and the WASM runtime when enabled.【F:main.ts†L14-L38】【F:docs/planning/RuntimeLayer.md†L9-L26】
- **HTTP → Middleware → Router (Layers 1–3):** Requests enter via the HTTP server, flow through an onion-style middleware pipeline (CORS/CSRF/ratelimiting/edge WASM hooks available), then match URLPattern-based routes registered in `src/routes`.【F:docs/planning/RuntimeLayer.md†L12-L45】【F:src/routes/mod.ts†L11-L29】
- **Controllers & API helpers (Layer 4 & 13):** Route handlers can return HTML via template utilities or JSON via `apiResponse`, keeping types and status enums standardized.【F:src/routes/api.ts†L11-L85】
- **Data & Auth (Layers 5–6):** KV-backed ORM with validators and indexed queries ships with RBAC-aware auth primitives so your models and sessions speak the same language.【F:src/models/user.ts†L1-L102】【F:docs/planning/RuntimeLayer.md†L43-L74】
- **Caching, views, jobs, search (Layers 7–10):** Optional caches, HTML helpers, cron/queue workers, and search indexing are pre-wired in the framework exports for when you need them—no extra packages required.【F:docs/planning/RuntimeLayer.md†L43-L74】
- **Admin & security (Layers 11 & 17):** Health endpoints, headers, and sanitizers are first-class so observability and hardening travel together.【F:src/routes/api.ts†L11-L50】【F:docs/planning/RuntimeLayer.md†L55-L74】
- **Plugins, WASM, and telemetry (Layers 12, 15–18):** Plugin manager, debugger, metrics, tracer, and logger are initialized during `app.init()`, and the WASM runtime/generator is enabled by default for sandboxed extensions or codegen flows.【F:docs/planning/RuntimeLayer.md†L27-L74】【F:main.ts†L14-L38】

**Batteries included:** If you scaffold a feature, the stack is already there—routes, middleware, metrics, and debugging are wired together; the KV ORM handles validation; security and RBAC hooks guard every layer; and WASM execution is ready without additional tooling.

## Project Layout
- `main.ts` – Entry point coordinating configuration, permission checks, KV open, route registration, and server startup.【F:main.ts†L14-L38】
- `src/routes/` – Home and API routers plus registration helpers (404/error defaults included).【F:src/routes/mod.ts†L11-L29】【F:src/routes/home.ts†L14-L142】【F:src/routes/api.ts†L11-L85】
- `src/models/` – Example Deno KV models such as `User` with validation and indexing helpers.【F:src/models/user.ts†L1-L102】
- `framework/` – Core framework modules exported through `@echelon/*` import paths (Application, router, middleware, ORM, auth, security, telemetry, WASM, plugins).
- `docs/planning/` – Architecture blueprints outlining the layered runtime and Application OS philosophy.【F:docs/planning/RuntimeLayer.md†L9-L107】

## Development Tasks
Use the built-in Deno tasks for a consistent workflow:
- `deno task dev` – Run in watch mode with all permissions for rapid iteration.【F:deno.json†L6-L8】
- `deno task start` – Start with only net/read/env permissions.【F:deno.json†L6-L9】
- `deno task test` – Run the test suite (full permissions).【F:deno.json†L6-L10】
- `deno task check` – Type-check the entry point.【F:deno.json†L6-L11】
- `deno task lint` – Lint with recommended rules (no `any`).【F:deno.json†L6-L13】【F:deno.json†L28-L33】
- `deno task fmt` – Format with project defaults (100 col width, 2-space indents, single quotes).【F:deno.json†L6-L13】【F:deno.json†L35-L39】

> Tip: Stick with Deno's dark-on-light aesthetic by pairing the gradient home page palette with the badges above to keep documentation visually aligned with the runtime's black-and-white dinosaur brand.
