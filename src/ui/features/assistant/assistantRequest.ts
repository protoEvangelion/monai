/**
 * Cross-component request to open the assistant with a skill card.
 *
 * The Amazon button lives in the transactions table, the panel lives in the
 * header, and the chat thread lives inside the panel. This is the one-way
 * wire between them: a button requests a skill, the panel opens, the chat
 * consumes the request and appends a card.
 *
 * Deliberately in-memory: sessions are not persisted yet, so a refresh drops
 * both the thread and any pending request.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let pendingSkillId: string | null = null;

/** Ask for a skill card. The panel opens and the chat picks it up. */
export function requestAssistantSkill(skillId: string) {
  pendingSkillId = skillId;
  for (const listener of listeners) listener();
}

/** Read and clear the pending request. Only the chat should consume it. */
export function consumeRequestedSkill() {
  const skillId = pendingSkillId;
  pendingSkillId = null;
  return skillId;
}

/** Notified on every request. Used by the panel to open itself. */
export function subscribeAssistantRequests(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
