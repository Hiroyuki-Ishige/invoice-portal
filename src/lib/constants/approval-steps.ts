/**
 * **The five steps of the ringi form, named once.**
 *
 * Two things print this list, and they are not in the same place: the stepper
 * across the top of `/approval/[id]`, and the strip in every route notification
 * (`lib/notify/mail-shell`). A mail that says the ringi is on "SCM" while the
 * screen it links to calls that step something else is a mail that has to be
 * checked against the app - which is the whole of what it was sent to save
 * (rules 5 and 20).
 *
 * Plain data on purpose: no React, no `@/` alias. A client component reads it,
 * the mail builders read it, and a throwaway `.mts` script driving the mail
 * builders resolves the relative path without Next.
 */

/** Which of the five steps. The `?step=` link and the stepper both mean this. */
export type ApprovalStep = 1 | 2 | 3 | 4 | 5;

export interface ApprovalStepDefinition {
  /** 1-based, and the number shown in the circle. */
  id: ApprovalStep;
  /** Who performs the step. */
  label: string;
  /** What happens in it. Shown under the label on screen; omitted in mail. */
  subLabel?: string;
}

export const APPROVAL_STEPS: ApprovalStepDefinition[] = [
  /* "Request", not "Applicant" (2026-08-30): the step is the thing being asked
     for, and "Applicant" was also the name of a person on it, a stage on the
     Step 1 route (Applicant PIC) and a group on the Step 5 one. One word for
     four things is how a sentence about "the Applicant" stops being answerable. */
  { id: 1, label: "Request", subLabel: "(Spec, Schedule)" },
  { id: 2, label: "SCM", subLabel: "(Purchase Negotiation)" },
  { id: 3, label: "Budget assignment", subLabel: "(by applicant)" },
  { id: 4, label: "Ringi Summary" },
  /* "Ringi Circulation", not "Circulation" (2026-10-19, the owner's word):
     the step is where the ringi itself goes round for approval, and the bare
     word was also SCM's and Step 1's "route". The mail's strip and its
     sentences ("only after Step 5 (Ringi Circulation)") read this name. */
  { id: 5, label: "Ringi Circulation", subLabel: "(Approval route)" },
];

/**
 * The step a value names, or `null`.
 *
 * `?step=` arrives in a URL - from a link this app wrote, or from anything at
 * all - so it is `unknown` until this says otherwise (rule 12). One owner,
 * because the page reads the parameter and the mail writes it.
 */
export function approvalStepOf(value: unknown): ApprovalStep | null {
  const id = Number(value);
  return APPROVAL_STEPS.some((step) => step.id === id) ? (id as ApprovalStep) : null;
}

/** The step's own words: `Applicant (Spec, Schedule)`. */
export function approvalStepName(step: ApprovalStep): string {
  const found = APPROVAL_STEPS.find((entry) => entry.id === step);
  if (!found) return `Step ${step}`;
  return found.subLabel ? `${found.label} ${found.subLabel}` : found.label;
}

/**
 * **The three steps a Step 4 release is a statement about.**
 *
 * Releasing the Ringi Summary to Circulation fixes the applicant and the
 * approver and opens Step 5 - it says the request, the prices and the budget
 * allotment are all settled. Three things ask this list: the "Check with AI"
 * rule, the button's own condition, and `ringipic-action`'s refusal (rule 21).
 * Named here so that adding a sixth step, or moving one, moves all three at
 * once rather than two of them (rules 5 and 20).
 */
export const STEPS_BEFORE_SUMMARY: readonly ApprovalStep[] = [1, 2, 3];

/**
 * `Step 1 (Request)` - the number a reader can find on the stepper, plus the
 * step's own word.
 *
 * The screen's tooltip, the consistency finding and the server's 409 all print
 * a step this way. Three spellings of one name is how a refusal stops matching
 * the thing it refuses.
 */
export function approvalStepShortName(step: ApprovalStep): string {
  const found = APPROVAL_STEPS.find((entry) => entry.id === step);
  return found ? `Step ${step} (${found.label})` : `Step ${step}`;
}
