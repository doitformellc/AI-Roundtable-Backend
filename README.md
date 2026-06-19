# AI Roundtable Consensus Engine - Backend

An Express-based Node.js backend that orchestrates a multi-agent adversarial consensus engine. It facilitates debate, critique, and synthesis between multiple Large Language Models (OpenAI and Gemini) to generate high-quality, verified content.

---

## 🚀 Overview

The AI Roundtable Backend implements an adversarial consensus pipeline. It brings together several AI roles (e.g., Lead Analyst, Skeptic Reviewer, Speed Researcher) to collaboratively draft, review, revise, and judge structured articles or academic content. The backend relies on a serverless-friendly local architecture with token-based authentication (Clerk) and a lightweight file-based JSON database.

---

## 🛠️ Tech Stack

- **Runtime Environment:** [Node.js](https://nodejs.org/) (configured with standard ES Modules)
- **Web Server Framework:** [Express.js](https://expressjs.com/) (`express` v4.19.2)
- **Authentication & Security:** 
  - [Clerk](https://clerk.com/) (`@clerk/backend` v1.22.0) for JWT session verification and authentication middleware.
  - Bypass authentication option for streamlined local development.
- **AI API Integrations:** 
  - Direct REST integrations (using `fetch` with AbortController and automatic 503 rate-limit back-off retries).
  - **OpenAI API** (`gpt-4o` as a debater and primary Consensus Judge).
  - **Google Gemini API** (`gemini-2.5-flash` and `gemini-2.5-flash-lite` as debaters).
- **Webhooks Handling:** [Svix](https://www.svix.com/) (`svix` v1.58.0) for verifying Clerk user-sync webhooks.
- **Database & Storage:** [MySQL](https://www.mysql.com/) database managed with [Prisma ORM](https://www.prisma.io/) (`prisma` and `@prisma/client` v5.22.0).
- **Environment Management:** `dotenv` (`^16.4.5`)

---

## 📋 Prerequisites

Before running the application, make sure you have:
- [Node.js](https://nodejs.org/) (v18.x or higher recommended)
- `npm` (packaged with Node.js)

---

## ⚙️ Installation & Setup

1. **Clone the Repository & Navigate to the Project:**
   ```bash
   cd AI-Roundtable-Backend
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file to `.env` (or `.env.local` for local overrides):
   ```bash
   cp .env.example .env
   ```

4. **Fill in the Configuration Variables:**
   Open `.env` and configure the following variables:

   | Variable | Description | Default / Example |
   | :--- | :--- | :--- |
   | `PORT` | The port the Express server will listen on. | `4000` |
   | `FRONTEND_URL` | Allowed CORS origin (comma-separated list if multiple). | `http://localhost:3000` |
   | `BYPASS_AUTH` | Bypasses Clerk authorization check for offline/dev. | `false` (set to `true` for easy development) |
   | `BYPASS_CLERK_ID` | Mock user Clerk ID used when `BYPASS_AUTH=true`. | `dev-bypass-user` |
   | `BYPASS_EMAIL` | Mock user email used when `BYPASS_AUTH=true`. | `dev@roundtable.local` |
   | `CLERK_SECRET_KEY` | Secret Key from your Clerk dashboard (required if `BYPASS_AUTH=false`). | `sk_test_...` |
   | `CLERK_WEBHOOK_SECRET` | Signing secret used to verify webhook signatures from Clerk. | `whsec_...` |
   | `OPENAI_API_KEY` | API Key for OpenAI services (required if OpenAI agent is enabled). | `sk-proj-...` |
   | `OPENAI_MODEL` | The default OpenAI chat completion model to use. | `gpt-4o` |
   | `GEMINI_API_KEY` | API Key for Google Gemini (required if Gemini agents are enabled). | `AIzaSy...` |
   | `GEMINI_20_FLASH_MODEL` | The default Google Gemini Flash model. | `gemini-2.0-flash` |
   | `GEMINI_FLASH_LITE_MODEL`| The secondary, lightweight Gemini model. | `gemini-2.5-flash-lite` |
   | `ANTHROPIC_API_KEY` | API Key for Anthropic services. | `sk-ant-...` |
   | `XAI_API_KEY` | API Key for xAI services. | `xai-...` |
   | `XAI_MODEL` | The default xAI model name. | `grok-4-1-fast-reasoning` |
   | `ENABLE_MOCK_PROVIDERS` | Enables local mock engines if LLM keys are missing. | `true` |
   | `DATABASE_URL` | MySQL connection string for Prisma. | `mysql://user:pass@localhost:3306/db_name` |

> [!NOTE]  
> If `BYPASS_AUTH=true` is set, the server ignores Clerk session tokens and creates/re-uses a default developer profile with standard start credits, making frontend development much faster.

> [!IMPORTANT]  
> In production environments, always set `NODE_ENV=production`. When running in production, the authentication bypass is programmatically disabled (regardless of the `BYPASS_AUTH` configuration), and valid Clerk JWT tokens verified against `CLERK_SECRET_KEY` are strictly required for all authenticated endpoints.

---

## 🏃 Running the Application

### Development Mode
Runs the server with automatic watch-mode enabled (auto-reloads on file changes):
```bash
npm run dev
```

### Production Mode
Starts the server normally:
```bash
npm start
```

### Database Setup & Migrations
Ensure your database server is running and `DATABASE_URL` is set in your `.env` or `.env.local` file.

1. **Deploy schema migrations:**
   ```bash
   npm run db:migrate
   ```
   *(For development sync without tracking migrations, run `npx prisma db push`)*

2. **Migrate legacy JSON data (optional):**
   If you have a legacy `data/db.json` file, run the migration script to populate MySQL:
   ```bash
   node scripts/migrateData.js
   ```

### Docker Mode
You can build and deploy the container image using the included `Dockerfile`:
```bash
docker build -t ai-roundtable-backend .
docker run -p 4000:4000 --env-file .env ai-roundtable-backend
```

---

## 📂 Project Structure

```text
├── controllers/            # Route handlers & controller logic
│   ├── articleController.js
│   ├── generateController.js
│   ├── userController.js
│   └── webhookController.js
├── data/                   # Database client instances
│   └── prisma.js           # Prisma client singleton
├── middleware/             # Express middlewares
│   └── clerkAuth.js        # Authentication check & User sync
├── prisma/                 # Prisma configuration and migrations
│   ├── migrations/         # SQL migration scripts
│   └── schema.prisma       # Database schema models (User, Transaction, Article)
├── routes/                 # Express Router endpoint definitions
│   ├── articleRoutes.js
│   ├── generateRoutes.js
│   ├── userRoutes.js
│   └── webhookRoutes.js
├── scripts/                # Database scripts
│   └── migrateData.js      # Utility to migrate legacy JSON db data to MySQL
├── services/               # Core business & LLM consensus logic
│   ├── providerService.js  # Low-level LLM prompt formatting & API dispatch
│   └── roundtableService.js# High-level orchestrator & database controller
├── .env.example            # Environment variables template
├── Dockerfile              # Docker configuration
├── package.json            # Node.js manifest & script commands
└── server.js               # Entry point of the Express server
```

---

## 🔌 API Documentation

### Public Endpoints
* **`GET /api/health`**
  * Verifies server health status.
  * **Response:** `{ "status": "ok" }`
* **`POST /api/webhook/clerk`**
  * Receives and processes Clerk webhook events (`user.created`, `user.updated`, `user.deleted`). Verified using Svix.

---

### Authenticated Endpoints
*Require a valid Bearer token in the `Authorization` header, or `BYPASS_AUTH=true` set in backend env.*

#### **User Routes (`/api/user`)**
* **`GET /api/user/credits`**
  * Fetches the authenticated user profile details along with their current credit balance.
* **`POST /api/user/credits/purchase`**
  * Purchases or adds mock credits to the user's account balance.
  * **Payload:** `{ "amount": 10, "creditsAdded": 20 }`

#### **Article Routes (`/api/articles`)**
* **`GET /api/articles`**
  * Lists all previous roundtable consensus articles generated by the user (sorted by creation date).
* **`GET /api/articles/:id`**
  * Fetches the detailed payload of a single article (including model logs, critiques, debate transcripts, and block-by-block text).

#### **Generation Routes (`/api`)**
* **`POST /api/generate`**
  * Launches the multi-agent consensus debate engine and returns the final article synchronously.
  * **Payload Parameters:**
    * `topic` (string, required): The prompt or topic description.
    * `category` (string): Type of document (`Homework`, `Research`, `Blog`).
    * `segment` (string): Target audience (`Nursery`, `Primary`, `Secondary`, `Undergraduate`, `Postgraduate`, `PhD`).
    * `intent` (string): Style guide (`Research`, `Legal`, `Technical`).
    * `length` (string): Text length target (`Short`, `Medium`, `Large`, `Extra Long`).
    * `tonality` (string): Tone selection (`Technical`, `Explanatory`, `Academic`).
    * `providers` (array of strings): Specify up to 3 models (e.g. `["openai", "gemini_flash", "gemini_flash_lite"]`).
    * `linking` (object): Dictates internal/external link rules.
* **`POST /api/generate/stream`**
  * Performs the exact same multi-agent debate process but returns the events in real-time as a Server-Sent Event (SSE) stream (`text/event-stream`).
  * Emits event states like `agent-thinking`, `agent-complete`, `stage-complete`, `complete`, and `error`.
* **`POST /api/generate/refine`**
  * Refines an individual block/section of an existing article while preserving the rest of the document context. Requires 1 credit.
  * **Payload:** `{ "articleId": "...", "blockId": "...", "instruction": "..." }`
