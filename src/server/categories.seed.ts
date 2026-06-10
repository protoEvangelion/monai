import { categories, transactions } from "../db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { match } from "ts-pattern";

type DefaultGroup = {
  name: string;
  icon: string;
  children: Array<{ name: string; icon: string }>;
};

export const DEFAULT_CATEGORIES: DefaultGroup[] = [
  {
    name: "Household",
    icon: "🏠",
    children: [
      { name: "Mortgage", icon: "🔑" },
      { name: "Home", icon: "🏠" },
      { name: "Electric", icon: "🔋" },
      { name: "Lawn", icon: "🍃" },
      { name: "HOA", icon: "💸" },
      { name: "Cleaning", icon: "🧼" },
      { name: "Utilities", icon: "🔌" },
      { name: "Water", icon: "💧" },
      { name: "Pets", icon: "🐶" },
    ],
  },
  {
    name: "Food",
    icon: "🥑",
    children: [
      { name: "Groceries", icon: "🥑" },
      { name: "Restaurants", icon: "🍔" },
    ],
  },
  {
    name: "Giving",
    icon: "💝",
    children: [
      { name: "Church", icon: "💝" },
      { name: "Gifts", icon: "🎁" },
    ],
  },
  {
    name: "Other",
    icon: "🤷‍♂️",
    children: [
      { name: "Other", icon: "🤷‍♂️" },
    ],
  },
  {
    name: "Family",
    icon: "👨‍👩‍👧‍👦",
    children: [
      { name: "Clothing", icon: "👕" },
      { name: "Education", icon: "📚" },
      { name: "College", icon: "🔖" },
      { name: "Baby", icon: "🍼" },
      { name: "Chores", icon: "🏡" },
    ],
  },
  {
    name: "Health",
    icon: "👨‍⚕️",
    children: [
      { name: "Doctor", icon: "👨‍⚕️" },
      { name: "Personal Care", icon: "✂️" },
      { name: "Gym", icon: "👟" },
      { name: "Drugs", icon: "💊" },
    ],
  },
  {
    name: "Fun",
    icon: "🎟",
    children: [
      { name: "Entertainment", icon: "🎟" },
      { name: "Travel", icon: "🚙" },
      { name: "Hunting", icon: "🔫" },
    ],
  },
  {
    name: "Auto",
    icon: "🚗",
    children: [
      { name: "Gas", icon: "⛽" },
      { name: "Car Fund", icon: "🚗" },
      { name: "Auto Ins", icon: "🚘" },
    ],
  },
  {
    name: "Biz",
    icon: "📈",
    children: [
      { name: "Work Expenses", icon: "💼" },
    ],
  },
];

// Old group names that should be merged into a canonical default group name.
const GROUP_ALIASES: Record<string, string> = {
  "Food & Dining": "Food",
  Home: "Household",
  Transportation: "Auto",
  Shopping: "Family",
  Entertainment: "Fun",
  "Health & Fitness": "Health",
  Travel: "Fun",
  Income: "Biz",
  "Personal Care": "Health",
  Education: "Family",
  Financial: "Other",
  Miscellaneous: "Other",
};

type DbCategory = {
  id: number;
  name: string;
  parentId: number | null;
  userId: string;
  icon: string | null;
  budgetAmount: number;
};

const groupByParentName = (cats: DbCategory[]) =>
  cats.reduce((map, cat) => {
    if (cat.parentId !== null) return map;
    return map.set(cat.name, [...(map.get(cat.name) ?? []), cat]);
  }, new Map<string, DbCategory[]>());

async function mergeAliasGroups(
  db: { update: Function; delete: Function; query: unknown },
  existing: DbCategory[],
) {
  await Promise.all(
    Object.entries(GROUP_ALIASES).map(async ([alias, canonical]) => {
      const aliasGroup = existing.find(
        (c) => c.parentId === null && c.name === alias,
      );
      const canonicalGroup = existing.find(
        (c) => c.parentId === null && c.name === canonical,
      );
      if (!aliasGroup || !canonicalGroup) return;

      const aliasChildren = existing.filter(
        (c) => c.parentId === aliasGroup.id,
      );
      const canonicalChildren = existing.filter(
        (c) => c.parentId === canonicalGroup.id,
      );

      await Promise.all(
        aliasChildren.map((child) => {
          const matched = canonicalChildren.find((c) => c.name === child.name);
          return matched
            ? db
                .update(transactions)
                .set({ categoryId: matched.id })
                .where(eq(transactions.categoryId, child.id))
                .then(() =>
                  db.delete(categories).where(eq(categories.id, child.id)),
                )
            : db
                .update(categories)
                .set({ parentId: canonicalGroup.id })
                .where(eq(categories.id, child.id));
        }),
      );
      await db.delete(categories).where(eq(categories.id, aliasGroup.id));
    }),
  );
}

async function dedupRootGroups(
  db: { update: Function; delete: Function; query: unknown },
  existing: DbCategory[],
) {
  const rootByName = groupByParentName(existing);

  await Promise.all(
    [...rootByName.entries()]
      .filter(([, roots]) => roots.length >= 2)
      .map(async ([, dupRoots]) => {
        const [keep, ...toRemove] = dupRoots
          .slice()
          .sort((a, b) => a.id - b.id);
        const keepChildren = existing.filter((c) => c.parentId === keep.id);

        await Promise.all(
          toRemove.map(async (dupRoot) => {
            const dupChildren = existing.filter(
              (c) => c.parentId === dupRoot.id,
            );

            await Promise.all(
              dupChildren.map((child) => {
                const sameName = keepChildren.find(
                  (c) => c.name === child.name,
                );
                return match(sameName)
                  .when(
                    (s): s is NonNullable<typeof s> => s != null,
                    (matched) =>
                      db
                        .update(transactions)
                        .set({ categoryId: matched.id })
                        .where(eq(transactions.categoryId, child.id))
                        .then(() =>
                          db
                            .delete(categories)
                            .where(eq(categories.id, child.id)),
                        ),
                  )
                  .otherwise(() =>
                    db
                      .update(categories)
                      .set({ parentId: keep.id })
                      .where(eq(categories.id, child.id))
                      .then(() =>
                        keepChildren.push({ ...child, parentId: keep.id }),
                      ),
                  );
              }),
            );

            await db.delete(categories).where(eq(categories.id, dupRoot.id));
          }),
        );
      }),
  );
}

async function seedMissingDefaults(
  db: { insert: Function; query: { categories: { findFirst: Function } } },
  userId: string,
) {
  await Promise.all(
    DEFAULT_CATEGORIES.map(async (group) => {
      let parent = await db.query.categories.findFirst({
        where: and(
          eq(categories.userId, userId),
          isNull(categories.parentId),
          eq(categories.name, group.name),
        ),
      });

      if (!parent) {
        [parent] = await db
          .insert(categories)
          .values({
            userId,
            name: group.name,
            icon: group.icon,
            budgetAmount: 0,
          })
          .returning();
      }

      await Promise.all(
        group.children.map(async (child) => {
          const exists = await db.query.categories.findFirst({
            where: and(
              eq(categories.userId, userId),
              eq(categories.parentId, parent.id),
              eq(categories.name, child.name),
            ),
          });
          if (!exists) {
            await db
              .insert(categories)
              .values({
                userId,
                name: child.name,
                icon: child.icon,
                parentId: parent.id,
                budgetAmount: 0,
              });
          }
        }),
      );
    }),
  );
}

export async function seedDefaultCategories(userId: string) {
  const { db } = await import("../db");
  const existing = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
  });

  await mergeAliasGroups(db, existing);

  const refreshed = await db.query.categories.findMany({
    where: eq(categories.userId, userId),
  });
  await dedupRootGroups(db, refreshed);

  await seedMissingDefaults(db, userId);
}
