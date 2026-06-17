type FindingStatus = "draft" | "in_review" | "confirmed" | "informational" | "false_positive";

// Transitions that go backward in the review flow and require explicit justification
const BACKWARD_TRANSITIONS = new Set([
  "confirmed→in_review",
  "informational→in_review",
  "false_positive→in_review",
  "in_review→draft",
  "confirmed→draft",
]);

export function isBackwardTransition(from: FindingStatus, to: FindingStatus): boolean {
  return BACKWARD_TRANSITIONS.has(`${from}→${to}`);
}
