<div align="center">

# 🚀 DreamPlanner (IgniteMate)
### *Autonomous Goal Achievement Engine powered by Tiered AI Cognition & Hindsight Memory*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-000000.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748.svg)](https://www.prisma.io/)
[![Supabase](https://img.shields.io/badge/Supabase-pgvector-3ECF8E.svg)](https://supabase.com/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-stealth%2Fspace--bunny--alpha-purple.svg)](https://openrouter.ai/)
[![Hindsight Memory](https://img.shields.io/badge/Hindsight-Agentic%20Memory-orange.svg)](https://github.com/vectorize-io/hindsight)
[![Vitest](https://img.shields.io/badge/Vitest-3.2%20(100%25%20Passing)-green.svg)](https://vitest.dev/)

[![YouTube Demo](https://img.shields.io/badge/YouTube-Watch%20Video%20Demo-red?style=for-the-badge&logo=youtube)](https://youtu.be/y54Z_HNeJI8)

[Video Walkthrough](#-video-walkthrough--live-demo) • [Architecture Blueprint](#system-architecture) • [Hindsight Memory Engine](#hindsight-memory-engine-integration) • [Features](#key-features) • [Getting Started](#getting-started) • [API Documentation](#api--websocket-specification)

---

</div>

## 🎬 Video Walkthrough & Live Demo

Watch the full video walkthrough showing DreamPlanner, the IgniteMate agentic loop, and Hindsight memory recall in action:

[![DreamPlanner Video Demo](https://img.youtube.com/vi/y54Z_HNeJI8/maxresdefault.jpg)](https://youtu.be/y54Z_HNeJI8)

▶️ **[Watch the full video demonstration on YouTube](https://youtu.be/y54Z_HNeJI8)**

---

## 📖 Overview

**DreamPlanner** is a production-grade, AI-driven goal achievement platform designed to bridge the gap between high-level human ambitions (**Dreams**) and daily execution (**Tasks** & **Roadmaps**).

At its core is **IgniteMate**, an autonomous AI agent engineered around a **Tiered Information Authority System**, **Semantic Hybrid Routing**, **pgvector Entity Resolution**, and the **Hindsight Memory Engine**. Unlike traditional chat applications that succumb to prompt inflation and memory hallucinations, DreamPlanner guarantees strict boundaries between **ground truth state**, **recalled behavioral memory**, and **dialogue input**.

---

## 🏗️ System Architecture

DreamPlanner uses a decoupled, event-driven architecture with dedicated layers for cognitive reasoning, memory, data persistence, and real-time client interaction.

```mermaid
graph TD
    subgraph Client Layer
        WebUI[React 19 + Vite Frontend] <-->|REST API + HttpOnly Cookies| ExpressApp[Express 5 API Backend]
        WebUI <-->|WebSockets /ws| WSApp[WebSocket Event Gateway]
    end

    subgraph Security & Pipeline Gateway
        ExpressApp --> AuthMW[JWT Cookie Middleware]
        AuthMW --> ChatCtrl[Chat Controller]
        ChatCtrl --> Orchestrator[AI Orchestrator Pipeline]
    end

    subgraph Tiered Cognition & Memory Engine
        Orchestrator --> StateInterceptor[State Interceptor / ActionSession]
        Orchestrator --> ContextCompiler[Context Compiler]
        ContextCompiler <-->|Tier 1: Ground Truth| Postgres[(Supabase PostgreSQL + pgvector)]
        ContextCompiler <-->|Tier 2: Episodic Memory| Hindsight[Hindsight Memory Engine]
        ContextCompiler <-->|30s Session Cache| Redis[(Redis)]
        Orchestrator --> IntentGate[Intent & Complexity Gatekeeper]
        Orchestrator --> HybridRouter[Semantic Hybrid Tool Router]
        Orchestrator --> EntityResolver[pgvector Semantic Entity Resolver]
        Orchestrator --> ValidationGate[Validation Gate]
    end

    subgraph Execution & Output Synthesis
        ValidationGate --> ToolExecutor[Tool Executor Dispatcher]
        ToolExecutor --> CoreModules[Dream, Task, Roadmap & Analytics Services]
        CoreModules --> Postgres
        ToolExecutor --> HindsightRetain[Hindsight.retain / reflect]
        Orchestrator --> Naturalizer[Natural Language Synthesizer]
        Naturalizer --> OpenRouter[OpenRouter - stealth/space-bunny-alpha]
    end
```

---

## 🛡️ Tiered Information Authority System

To prevent hallucinated database IDs, false progress tracking, or corrupted goal states, DreamPlanner enforces a **3-Tiered Authority Hierarchy**:

```
                       USER MESSAGE
                            │
                            ▼
                  ┌──────────────────┐
                  │ Conversation     │
                  │ / Intent Gate    │
                  └────────┬─────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   STATE SNAPSHOT       │
              │                        │
              │ Active goal             │
              │ Active roadmap          │
              │ Relevant tasks          │
              │ Pending action          │
              │ Current session         │
              └────────────┬───────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        PostgreSQL                Hindsight
      SOURCE OF TRUTH          LONG-TERM MEMORY
        (Tier 1)                  (Tier 2)
              │                         │
              │                  recall / reflect
              │                         │
              └────────────┬────────────┘
                           ▼
                   CONTEXT COMPILER
                           │
                           ▼
                         LLM
                           │
                           ▼
                  STRUCTURED ACTION
                           │
                           ▼
                   VALIDATION GATE
                           │
                           ▼
                    TOOL EXECUTOR
                           │
                           ▼
                    PostgreSQL (Mutate State)
                           │
                           ▼
                    EVENT / OUTCOME
                           │
                           ▼
                  Hindsight (retain)
```

| Authority Tier | System Source | Authority Level | Strict Rule |
| :--- | :--- | :--- | :--- |
| **Tier 1: Absolute Truth** | PostgreSQL (Supabase) | **100 (Immutable)** | Contains active dreams, tasks, roadmaps, checkpoints, and action sessions. The LLM **must never invent** entity IDs or statuses. |
| **Tier 2: Learned Memory** | Hindsight Engine | **50 (Guidance)** | Contains recalled behavioral habits, time estimation patterns, past obstacles, and persona preferences (e.g. David Goggins / CR7 tone). |
| **Tier 3: Dialogue Input** | ChatMessage Transcript | **10 (Utterance)** | Short-term dialogue input used for intent classification and natural language parsing. |

---

## 🧠 Hindsight Memory Engine Integration

DreamPlanner integrates [Hindsight](https://github.com/vectorize-io/hindsight) to manage long-term agent memory across three core lifecycle APIs:

```mermaid
sequenceDiagram
    autonumber
    participant Pipeline as AI Pipeline
    participant CC as Context Compiler
    participant VG as Validation Gate
    participant HS as Hindsight Engine
    participant PG as PostgreSQL DB

    Note over Pipeline, HS: TURN START: Memory Recall Phase
    Pipeline->>PG: 1. Fetch State Snapshot (Tier 1)
    Pipeline->>HS: 2. hindsight.recall(userId, query)
    HS-->>CC: 3. Return recalled memories & preferences (Tier 2)
    CC->>CC: 4. Compile Tier 1 + Tier 2 + Tier 3 Prompt

    Note over Pipeline, PG: EXECUTION & VALIDATION PHASE
    Pipeline->>VG: 5. LLM Emits Structured Action
    VG->>PG: 6. Validate constraints (IDs exist in DB?)
    VG->>PG: 7. Execute Tool & Mutate DB State

    Note over Pipeline, HS: TURN END: Memory Retention & Reflection Phase
    Pipeline->>HS: 8. hindsight.retain(userId, eventOutcome)
    opt Periodically / Post-Turn
        HS->>HS: 9. hindsight.reflect(userId) -> Synthesize persona traits
    end
```

### Hindsight Lifecycle Methods
1. **`hindsight.retain({ userId, eventType, content, metadata })`**: Triggered when a user states a persona preference (*"talk with me like Goggins"*), completes a task, or adjusts a deadline.
2. **`hindsight.recall({ userId, query, topK })`**: Queried during `contextCompiler` execution to fetch semantically relevant past habits and persona instructions.
3. **`hindsight.reflect({ userId })`**: Runs periodically to synthesize high-level behavioral profiles (e.g., *"User performs best with short 30-minute daily sprints"*).

---

## ✨ Key Features

- 🎯 **Stateful Dream Creation (`syncDreamState`)**: Multi-field Redis-backed slot filling engine collecting goal title, domain, target deadline, skill level, and motivation statement.
- ⚡ **pgvector Entity Resolution**: Embeds search terms in real-time to resolve fuzzy references (*"move my guitar task to Friday"*) to exact DB UUIDs.
- 📆 **Relative Date Grounding (`dateGrounding.ts`)**: Resolves natural phrases like *"next sunday"*, *"in 3 days"*, *"end of month"* to ISO dates before validation.
- 🛡️ **Validation Gate (`validationGate.ts`)**: Sits between LLM output and database mutations to block hallucinated UUIDs and illegal state transitions.
- 📊 **Behavioral Analytics**: Computes discipline scores, consistency metrics, and execution velocity.
- 🔔 **Real-Time Notification Pipeline**: Multi-channel alert system with WebSockets and Firebase Cloud Messaging (FCM).

---

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js v24+, TypeScript 5.9
- **Framework**: Express.js 5.0
- **Database & ORM**: Supabase PostgreSQL + `pgvector`, Prisma 6.19
- **Cache & Sessions**: Redis (ioredis)
- **AI / LLM Engine**: OpenRouter (`stealth/space-bunny-alpha`), OpenAI SDK
- **Memory Engine**: Hindsight Engine (`@vectorize-io/hindsight`)
- **Testing**: Vitest 3.2 (100% passing suite)

### Frontend
- **Framework**: React 19, Vite 7.3
- **Styling**: Modern Vanilla CSS, Glassmorphism, CSS Custom Properties
- **State & Router**: React Context, React Router DOM v7
- **UI & Visualization**: Framer Motion, Lucide React, Recharts, `@xyflow/react`

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** >= 20.x
- **PostgreSQL** with `pgvector` extension enabled (or Supabase instance)
- **Redis** server (or local Redis instance)

### 1. Repository Setup
```bash
git clone https://github.com/swanith1234/DreamPlannerFrontend.git DreamPlanner
cd DreamPlanner
```

### 2. Backend Configuration & Launch
```bash
cd backend
npm install
```

Create `backend/.env`:
```env
PORT=3000
DATABASE_URL="postgresql://user:password@host:5432/dreamplanner?sslmode=require"
DIRECT_URL="postgresql://user:password@host:5432/dreamplanner"
REDIS_URL="redis://localhost:6379"

JWT_SECRET="your_jwt_secret_key"
OPENROUTER_API_KEY="your_openrouter_api_key"

# Optional: Live Hindsight Cloud API (defaults to in-memory local bank if omitted)
HINDSIGHT_API_URL="https://api.hindsight.vectorize.io"
HINDSIGHT_API_KEY="your_hindsight_api_key"
```

Initialize DB & Start Server:
```bash
npx prisma generate
npm run build
npm run dev
```

### 3. Frontend Launch
```bash
cd ../frontend
npm install
npm run dev
```
Access the application at `http://localhost:5173`.

---

## 🧪 Test Suite Execution

DreamPlanner includes a 100-test unit suite covering resolution, date grounding, JSON parsing, Hindsight memory operations, and validation gates.

```bash
cd backend
npm run test
```

### Sample Output:
```bash
 RUN  v3.2.7 /DreamPlanner/backend

 ✓ src/ai/hindsightService.test.ts (3 tests)
 ✓ src/ai/validationGate.test.ts (4 tests)
 ✓ src/ai/dateGrounding.test.ts (22 tests)
 ✓ src/ai/jsonParse.test.ts (20 tests)
 ✓ src/ai/resolution.test.ts (9 tests)
 ✓ src/modules/notification/pushPayload.test.ts (8 tests)
 ✓ src/modules/notification/notification.action.handler.test.ts (20 tests)
 ✓ src/modules/notification/notificationAction.token.test.ts (8 tests)
 ✓ src/utils/auditRedact.test.ts (6 tests)

 Test Files  9 passed (9)
      Tests  100 passed (100)
   Duration  527ms
```

---

## 📡 API & WebSocket Specification

### REST Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user account |
| `POST` | `/api/auth/login` | Authenticate and issue HttpOnly JWT cookie |
| `POST` | `/api/chat/` | Main chat endpoint routed to AI Orchestrator |
| `GET` | `/api/chat/history` | Retrieve paginated conversation history |
| `GET` | `/api/dreams` | List user dreams and milestone breakdowns |
| `POST` | `/api/dreams/sync` | Trigger stateful dream slot-filling engine |
| `GET` | `/api/tasks` | Fetch tasks with state & checkpoint filters |
| `PATCH` | `/api/tasks/:id/status` | Update task execution state |
| `GET` | `/api/analytics/dashboard` | Fetch discipline score & execution velocity |

### WebSockets Gateway
Connect to `ws://localhost:3000/ws` for real-time notification broadcasts and live state updates.

---

<div align="center">

Made with ❤️ by Swanith Pidugu & Team • Powered by Google Antigravity AI

</div>
