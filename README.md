# 💸 Monai — Financial Dashboard

> A blazing-fast, local-first financial dashboard. Privacy-first. AI-powered. Copilot Money vibes, minus the subscription.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📊 **Dashboard** | Net worth chart, budget progress, top categories at a glance |
| 🔄 **Transaction Review** | Pulse-animated queue of transactions begging for your attention |
| 🤖 **AI Categorization** | OpenRouter + Gemma auto-tags your merchants so you don't have to |
| ⏳ **Time Travel** | Jump to any past month to audit your past-self's spending crimes |
| 🏦 **Account Groups** | Credit, Depository, Investment, Loan, Real Estate — all in one place |
| 🔐 **Auth** | Clerk-powered, zero config |
| 🌗 **Dark / Light mode** | Your retinas, your rules |

---

## 🏗️ Tech Stack

```
Runtime      →  Bun
Framework    →  TanStack Start (full-stack React 19)
Auth         →  Clerk
Database     →  Bun SQLite + Drizzle ORM
UI           →  HeroUI v3 + Tailwind CSS v4
State        →  TanStack Query (server) · Zustand (client)
Charts       →  Recharts
Animation    →  Framer Motion
AI           →  OpenRouter → google/gemma-7b-it:free
Deploy       →  Vercel (Nitro)
Linting      →  oxlint
TypeScript   →  @typescript/native-preview (tsgo) 🚀
```

---

## 🚀 Getting Started

### 1. Install deps

```bash
bun install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | [clerk.com](https://clerk.com) → your app → API Keys |
| `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai) → Keys |

### 3. Set up the database

```bash
bun run db:push        # push schema to local SQLite
bun run db:studio      # optional: browse your data visually
```

### 4. Run it

```bash
bun --bun run dev      # http://localhost:3000
```

---

## 📦 Scripts

```bash
bun --bun run dev        # dev server on :3000
bun --bun run build      # production build
bun --bun run test       # vitest
bun run lint             # oxlint
bun run typecheck        # tsgo --noEmit (native TS compiler, fast af)
bun run deploy           # vercel --prod
```

### 🗄️ Database

```bash
bun run db:generate      # generate Drizzle migration files
bun run db:migrate       # run migrations
bun run db:push          # push schema directly (dev only)
bun run db:pull          # introspect existing DB
bun run db:studio        # open Drizzle Studio UI
```

---

## 🗂️ Project Structure

```
src/
├── routes/
│   ├── __root.tsx          # shell: sidebar, header, background orbs ✨
│   ├── index.tsx           # dashboard
│   ├── transactions.tsx    # transaction list
│   ├── accounts.tsx        # account groups
│   ├── categories.tsx      # budgeting + categories
│   └── sign-in.$.tsx       # Clerk sign-in
├── store/
│   ├── useTimeTravel.ts    # ⏳ month navigation state
│   └── useTheme.ts         # 🌗 dark/light toggle
├── integrations/
│   ├── clerk/              # auth provider + header user component
│   └── tanstack-query/     # query client + devtools
└── styles.css              # Tailwind v4 + HeroUI + orb animations
```

---

## 🧠 Data Schema

```sql
accounts          → id, name, type, current_balance
categories        → id, name, icon, budget_amount, parent_id
transactions      → id, account_id, category_id, amount, date,
                    merchant_name, note, is_reviewed, is_recurring
historical_balances → daily snapshots for net worth chart
```

---

## 🤖 AI Auto-Categorization

Monai ships an OpenRouter integration that feeds merchant names into `google/gemma-7b-it:free` and maps them to your custom category tree. No cloud sync required — your data stays local.

Set `OPENROUTER_API_KEY` in `.env.local` and it just works.

---

## 🚢 Deploying to Vercel

```bash
bun run deploy
```

Powered by Nitro (`preset: "vercel"`) + the Vercel CLI. Config lives in `vercel.json`. First run will prompt you to link the project — after that, pushing to your connected git repo auto-deploys.

---

## 🛠️ Development Notes

- **TypeScript** uses `@typescript/native-preview` (`tsgo`) — it's the Go-rewritten compiler. Blazing fast type checking.
- **Linting** is `oxlint` — Rust-based, no config needed, catches the things that matter.
- **No mocks in tests** — integration tests hit the real SQLite database.

---

<p align="center">Built with 🔥 + Bun + too much coffee</p>
