# Monai - Financial Dashboard Spec

Monai is a high-performance, local-first financial dashboard inspired by Copilot Money. It focuses on privacy, speed, and AI-driven insights.

## Tech Stack
- **Runtime:** Bun
- **Framework:** TanStack Start (Full-stack React)
- **Users:** Clerk
- **State Management:** React Query (Server), Zustand (Client)
- **Styling:** Tailwind CSS + Hero UI (formerly NextUI)
- **Database:** Bun SQLite + Drizzle ORM
- **AI:** OpenRouter (Model: `google/gemma-7b-it:free`) for auto-categorization
- **Tooling:** 
  - **Linter:** `oxlint`
  - **Formatter:** `oxfmt` (or Biome/Oxc-based equivalent)
  - **Build:** `vite 8`
  - **TypeScript:** bun install -D @typescript/native-preview
      - bunx tsgo -v

## Core Features

### 1. Dashboard (The Command Center)
- **Net Worth Widget:** Interactive chart (Assets vs. Debts) with time-range toggles.
- **Spending Progress:** Real-time budget vs. actual spending bar.
- **Transactions to Review:** A high-priority list of uncategorized or "to-review" items.
- **Top Categories:** Visual breakdown of monthly spending.

### 2. Transaction Management
- **Universal List:** Fast, searchable, and filterable list of all financial movements.
- **Detail Panel:** Slide-out editor for date, amount, category, and notes.
- **Auto-Categorization:** On-demand or background processing of transactions using OpenRouter's Gemma model to suggest categories based on merchant names.

### 3. Account Management
- **Grouped Views:** Cash, Credit, Investments, Loans, and Real Estate.
- **Local-First:** Focus on manual entry and CSV imports for maximum privacy, with a structured schema for future bank sync.

### 4. Categories & Budgeting (Time Travel Feature)
- **Flexible Budgeting:** Define monthly targets per category.
- **Time Travel:** A historical review mode allowing users to jump to **any month at any point in time** to analyze past spending patterns and category performance without losing current context.

### 5. AI Engine
- **OpenRouter Integration:** Uses the `OPENROUTER_API_KEY` from `.env`.
- **Prompting:** Specialized prompts to classify merchants into the user's custom category tree.

## Data Schema (Drizzle)
- `accounts`: ID, name, type (cash, credit, etc.), current_balance.
- `categories`: ID, name, icon, budget_amount, parent_id.
- `transactions`: ID, account_id, category_id, amount, date, merchant_name, note, is_reviewed, is_recurring.
- `historical_balances`: Daily snapshots for net worth tracking.

## Development Workflow
1. **Init:** `bun init` and scaffold TanStack Start.
2. **Schema:** Define Drizzle models and push to local SQLite.
3. **UI Foundations:** Setup Hero UI and Tailwind.
4. **AI Logic:** Implement the OpenRouter categorization service.
5. **Time Travel:** Build the category history navigation.
