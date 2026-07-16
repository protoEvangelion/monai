import { Database } from "bun:sqlite";
import path from "node:path";

type Update = {
  transactionId: number;
  note: string;
  categoryId?: number;
};

const databasePath = path.resolve(
  process.cwd(),
  process.env.PLAID_PRODUCTION_DATABASE_URL?.replace(/^file:/, "").replace(/^"|"$/g, "") ??
    "data/production.db",
);

const updates: Update[] = JSON.parse(process.argv[2] ?? "[]");

if (updates.length === 0) {
  console.error("usage: bun scripts/apply-amazon-notes.ts '<json updates>'");
  process.exit(1);
}

const db = new Database(databasePath);
const updateNote = db.prepare("update transactions set note = ? where id = ?");
const updateNoteAndCategory = db.prepare(
  "update transactions set note = ?, category_id = ? where id = ?",
);
const findTx = db.prepare("select id, note from transactions where id = ?");

const apply = db.transaction(() => {
  for (const row of updates) {
    const current = findTx.get(row.transactionId) as { id: number; note: string | null } | undefined;
    if (!current) {
      console.warn(`skip missing tx ${row.transactionId}`);
      continue;
    }
    if (current.note?.trim()) {
      console.warn(`skip existing note tx ${row.transactionId}`);
      continue;
    }
    if (row.categoryId) {
      updateNoteAndCategory.run(row.note, row.categoryId, row.transactionId);
    } else {
      updateNote.run(row.note, row.transactionId);
    }
    console.log(`updated ${row.transactionId}: ${row.note}`);
  }
});

apply();
db.close();
