# LLM Categorization Spec

## Goal
Use an LLM to assign categories to transactions after sync, without using hardcoded merchant rules.

## Scope
- Categorization only.
- No auto-review.
- No category creation.
- Categories must be selected from existing user categories.
- LLM output should not be "other" or "uncategorized"

## Trigger Points
- After first account connection and initial transaction sync.
- After manual Sync.
- After 24-hour auto-sync.
- Optional manual run via AI Categorize button (dashboard review mode).

## Input Data
- Transactions for the user/item that need categorization.
- Existing leaf categories for the user.
- Category names are sent to the model.
- Optional: specific transaction IDs when run from UI (selection-scoped categorization).

## Prompt Contract (Simple)
Send one super simple prompt:

`We are going to give you a list of transactions & categories. Return valid json where key is transaction name & value is category. Example output: {"mcdonalds blah":"restaurants","texico gas": "gas"}`

Categories sent to model: user's leaf categories only (no parent groups, no catch-all categories like Other/Misc/General/Uncategorized).

## Model Behavior
- Model must return one category per transaction.
- Returned category names must be from the provided category list.
- Null/empty category is not allowed.
- Output must be valid JSON where key = transaction name and value = category name.
- If model output is malformed or invalid, fallback logic assigns a valid existing category.

## Model Selection (OpenRouter Free)
Primary models (in fallback order):
1. `openai/gpt-oss-20b:free`
2. `google/gemma-3-12b-it:free`
3. `meta-llama/llama-3.3-70b-instruct:free`
4. `qwen/qwen3-next-80b-a3b-instruct:free`

Override via env: `OPENROUTER_CATEGORIZER_MODEL`

## Constraints
- No merchant-specific hardcoded rules.
- No "invented" categories.
- No writes to category definitions.

## Fallback Strategy
When model output is unavailable or invalid:
- Use deterministic heuristic scoring against existing categories.
- Preserve existing categories if row already has one (don't over-write with heuristic guess).
- Heuristic fallback only for rows with null category.
- Always assign a valid existing leaf category.

## Observability
Log to dev console:
- the exact LLM prompt (`[categorize][prompt]`)
- the raw LLM response (`[categorize][response]`)

Also log per-decision details (one JSON line per transaction):
- transaction id
- merchant name
- amount
- previous category
- next category
- reason/source (model or fallback)
- model name (if used)

Format: `[categorize] { txId: ..., merchant: ..., categoryId: ..., reason: "model|heuristic" }`

## UI Implementation (ReviewTable)

### Loading State
- Uses React 18's `useTransition()` hook for idiomatic TanStack pattern
- `handleAICategorize` wrapped in `startAITransition()` callback
- Button shows spinner while pending

### Selection-Scoped Categorization
- When rows are selected, only those IDs are sent to server
- Server fn `runAICategorization(data?: { ids: number[] })`
- If no selection, entire dataset is categorized

### Button Labels
- `AI Categorize ({count})` where count = selected rows or all unreviewed
- `Mark Reviewed ({count})`
- Counts update in real-time as selection changes

### Dashboard vs Transactions
- **Dashboard** (`/`): Review mode, shows AI Categorize + Mark Reviewed buttons
- **Transactions** (`/transactions`): Full history (showAll=true), no action buttons

## E2E Testing

### Playwright Setup
- Tests in `e2e/review-table.spec.ts`
- Global setup: `e2e/global-setup.ts` runs once before tests
- Config: `playwright.config.ts`

### DB Seeding (Global Setup)
- Runs `drizzle-kit push --force` to initialize schema
- Creates ephemeral test DB (not production data)
- Seeds: 1 test account, 2 categories, 3 unreviewed transactions
- Uses `INSERT OR IGNORE` for idempotent re-runs

### Local vs CI
- **Local**: Uses `./data/test-e2e.db` (persistent across runs)
- **CI**: Fresh `./data/test-e2e.db` per workflow run
- Both set via `DATABASE_URL` in playwright.config.ts

### Test Coverage
- Select-all checkbox behavior
- Per-row selection
- Action button visibility (dashboard vs transactions)
- Button labels with counts
- Rendering checks on both pages

## Success Criteria
- ✅ New synced transactions are categorized automatically.
- ✅ Manual AI Categorize can recategorize selected or all rows.
- ✅ Categorization does not create or modify categories.
- ✅ Decision logs exist for debugging/audit.
- ✅ E2E tests pass locally and in CI.
- ✅ No TypeScript errors after UI refactor.

## Non-Goals
- Auto-review workflow.
- Budget adjustments.
- Rule-based merchant mapping.

