import { ShoppingBagIcon, type LucideIcon } from "lucide-react";

/**
 * Chat skills.
 *
 * A skill is a slash command the composer recognises. It does not go to the
 * model — it opens a card in the thread that collects whatever input the skill
 * needs (here: a scraped Amazon payment-history JSON) and then calls a server
 * function directly. That keeps tool runs deterministic, cheap, and visible in
 * the Runs tab.
 */
export type Skill = {
  id: string;
  /** Slash command, including the leading slash. */
  command: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Shown under the command in the slash menu. */
  hint: string;
};

export const SKILLS: Skill[] = [
  {
    id: "categorize-amazon-transactions",
    command: "/categorize-amazon-transactions",
    name: "Categorize Amazon transactions",
    description: "Match Amazon charges missing a note against your payment history.",
    icon: ShoppingBagIcon,
    hint: "Asks for a scraped payment-history JSON",
  },
];

/**
 * Split `/command rest of the draft` into the skill and its raw argument string.
 * Returns null when the draft is not a slash invocation of a known skill.
 */
export function parseSkillDraft(draft: string) {
  const trimmed = draft.trim();
  if (!trimmed.startsWith("/")) return null;

  const [head, ...rest] = trimmed.split(/\s+/);
  const skill = SKILLS.find((candidate) => candidate.command === head.toLowerCase());
  if (!skill) return null;

  return { skill, args: rest.join(" ").trim() };
}

/** Skills whose command starts with the text typed after `/`. */
export function filterSkills(query: string) {
  const needle = query.toLowerCase();
  return SKILLS.filter((skill) => skill.command.slice(1).startsWith(needle));
}
