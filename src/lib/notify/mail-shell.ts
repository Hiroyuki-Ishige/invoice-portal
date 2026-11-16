/**
 * The look of every message this app sends.
 *
 * One shell, two senders: the route notifications write themselves, the Step 5
 * composer carries what somebody typed. They differ in the words. They must not
 * differ in the letterhead, or an approver learns two things to trust instead
 * of one.
 *
 * ### Written for mail clients, not for browsers
 *
 * The app's own CSS is no use here. Outlook on Windows renders HTML with Word,
 * which has no flexbox, no grid, no `<style>` worth relying on and no
 * `border-radius`; Gmail strips a `<head>`. So: **tables, inline styles, and a
 * fixed 600px width**, which is the width every client shows without a
 * horizontal scrollbar - **900px for a message carrying the price comparison**
 * (`wide`, asked for 2026-10-19), where the grid is the point of the message and
 * 600px dealt five suppliers into two tables. Word ignores `max-width`, so a
 * reading pane under 900px scrolls that one sideways; `max-width:100%` still
 * shrinks it on a phone. Rounded corners and shadows are still declared - the
 * clients that understand them get the softer card, Word gets square edges and
 * loses nothing that matters.
 *
 * Colours are the MD brand ones from CLAUDE.md, stated as hex rather than
 * inherited: mail has no design system to inherit from.
 */

import {
  APPROVAL_STEPS,
  approvalStepName,
  type ApprovalStep,
} from "../constants/approval-steps";

/** The card's width, ordinary and `wide`. */
export const MAIL_WIDTH = 600;
export const WIDE_MAIL_WIDTH = 900;
/** The card's width for a message that is, or is not, `wide`. */
export const mailWidth = (wide = false): number => (wide ? WIDE_MAIL_WIDTH : MAIL_WIDTH);
/** The card's inset either side - every row of it, so a picture can be sized to what is left. */
const MAIL_PADDING_X = 28;
/** What is left inside the card for the message itself. */
export const mailContentWidth = (wide = false): number => mailWidth(wide) - 2 * MAIL_PADDING_X;

/*
 * **The mail palette, stated once** for every renderer of a message - this
 * shell, the price report and the route summary each had their own copy until
 * review (2026-10-19, rules 20 and 33). A message has no design system to
 * inherit from, so these are restated from the app's brand colours, not
 * imported from its CSS.
 */
export const HOYA_BLUE = "#0057BC";
export const WARM_BLACK = "#2D2A28";
export const COOL_GREY = "#B0B5B5";
const PAGE_BG = "#f1f4f7";
export const CARD_BORDER = "#e3e8ee";
/** The facts panel and every other quiet panel - a near-white, structure only. */
export const FACT_BG = "#f7f9fb";
/** Secondary text: the screen's slate-500, 4.76:1 on white where Cool Grey is 2:1. */
export const MUTED = "#64748b";
/** HOYA Blue at 10% over white (230,238,248) - an adopted cell, the stage the ringi is on. */
export const HOYA_BLUE_TINT = "#e6eef8";
/** A cleared step's circle - HOYA Blue at the tint the app's stepper uses. */
const STEP_DONE_BG = "#eaf1fb";
/** The connector between two steps that are not there yet. */
const STEP_LINE = "#dfe6ee";

/**
 * **What kind of message this is, as a colour.**
 *
 * Deliberately quiet: the band sits under the letterhead on every message this
 * app sends, so a strong colour there would be shouting on the ordinary ones
 * and would have nothing left for the message that matters. A returned ringi is
 * not an error - somebody has asked for a change - so it gets the same warm
 * amber as the "Reason given" panel it usually arrives with, and the two read
 * as one thing.
 *
 * ### `success` was green until 2026-09-04, and green is nowhere in the palette
 *
 * `.claude/rules/ui-design.md` closes the set to the MD brand colours, and this
 * is the app's own outgoing mail - the thing a reader from another company sees
 * of it. `#ecfdf3` / `#15803d` is now **Cyan Blue**, built the same way `info`
 * is built from HOYA Blue: the accent at ~8% on white for the band, and a
 * **darkened** accent for the text, which the rule allows in as many words ("an
 * MD brand colour, **or a variance of one**").
 *
 * - `#ebf8fc` is `#00A3DE` at 8% on white, exactly as `#eaf1fb` is `#0057BC`
 *   at 8%.
 * - `#007099` is `#00A3DE` at the same hue (196 degrees) and 30% lightness.
 *   The accent itself is ~2.6:1 on that tint - nowhere near AA - so the text
 *   has to be the darkened variance, not the brand value.
 *
 * **Cyan Blue rather than HOYA Blue**, and not filled. HOYA Blue is already the
 * `info` band *and* the letterhead directly above it, so a HOYA Blue band would
 * read as one two-line bar; and a filled band is the shouting the paragraph
 * above rules out.
 *
 * > **The honest cost:** `info` and `success` are now two pale blues and are
 * > less distinguishable from each other than blue-against-green was. That is
 * > the right trade, because the distinction this band exists for is **amber
 * > against not-amber** - the bug it was built for was a returned ringi looking
 * > exactly like an approved one - and amber is untouched.
 */
const TONE_STYLES: Record<MailTone, { background: string; text: string }> = {
  info: { background: "#eaf1fb", text: HOYA_BLUE },
  warning: { background: "#fff8e6", text: "#b45309" },
  success: { background: "#ebf8fc", text: "#007099" },
};

/** Segoe UI first: this is a Microsoft 365 tenant, and it is what Outlook has. */
const FONT_STACK = "'Segoe UI',Helvetica,Arial,sans-serif";

/**
 * Everything that reaches the message body is escaped - names and titles are
 * free text. Exported so the hand-written mail escapes by the same rule; two
 * escapers is how one of them ends up missing a character.
 *
 * **Safe for element text and for quoted attribute values. Not for URLs, and
 * not for anything inside a `<script>` or a `style="..."` expression.** A URL
 * needs `encodeURIComponent` on its variable part first - escaping only stops
 * the string breaking out of the attribute, it does not stop the URL itself
 * meaning something else.
 *
 * `'` is escaped even though every caller today uses `"` around its attributes:
 * the alternative is a rule that holds until somebody writes a single-quoted
 * attribute, and nothing would fail visibly when they did.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * **A section heading in the body of a message** - Description, Negotiation by
 * SCM, the reason, the purchasing history, SCM approval.
 *
 * A HOYA Blue dot and 16px bold Warm Black (the owner's request, 2026-10-19):
 * a long message needs headings a reader can scan down, and a small caption
 * does not read as one. The dot is a character, not a styled box - Word draws
 * a `border-radius` square. One function for both renderers (rule 20).
 *
 * **Section headings only.** The grid's column heads (SCOPE LINE and the
 * suppliers) stay small capitals: they label a column, not a part of the mail.
 */
export function sectionHeadingHtml(text: string): string {
  return `<div style="font-family:${FONT_STACK};font-size:16px;font-weight:700;line-height:1.3;
                      color:${WARM_BLACK};margin:28px 0 10px">
            <span style="color:${HOYA_BLUE};font-size:20px;line-height:1;vertical-align:-2px">&#9679;</span>&nbsp;&nbsp;${escapeHtml(text)}
          </div>`;
}

/** One `label / value` line in the facts panel. */
export interface MailFact {
  label: string;
  /** Plain text. Escaped here - do not pass HTML. */
  value: string;
  /** Renders bolder and darker. The ringi number, typically. */
  strong?: boolean;
}

/** How loud the band under the letterhead is. See `TONE_STYLES`. */
export type MailTone = "info" | "warning" | "success";

export interface MailShellInput {
  /**
   * **What this message is**, in three or four words - "Approval needed",
   * "Returned to the applicant", "Approved". Plain text.
   *
   * It is the band directly under the letterhead, which is the first thing read
   * after the app's own name and the only line that survives being skimmed. It
   * was small blue caps *below* the facts until 2026-08-30, where a returned
   * ringi looked exactly like an approved one until you read the sentence.
   */
  eyebrow: string;
  /** The band's colour. `info` where a message does not say. */
  tone?: MailTone;
  /**
   * The message itself, as HTML. **Already escaped or already sanitised by the
   * caller** - the shell interpolates it as-is, because for the composer this
   * is the sender's formatting and stripping it here would undo the editor.
   */
  bodyHtml: string;
  facts: MailFact[];
  /** An aside under the message - the reason a ringi was sent back. HTML. */
  noticeHtml?: string;
  /**
   * **What the reader must not do yet**, straight under the opening sentence
   * and before anything else - filled HOYA Blue with white bold text (7.0:1),
   * the heaviest weight of the one hue rather than a second colour (rule 33).
   * SCM's sign-off carries "no PO before Step 5". HTML, already escaped.
   */
  calloutHtml?: string;
  /**
   * A report the message is **about**, rendered after the facts and any notice
   * and before the button - the price comparison an SCM approval carries.
   *
   * Its own slot rather than appended to `bodyHtml`, which is the sentence
   * saying what happened and sits above the facts: a table between the lead and
   * "Application: 26-HOGV1-0001" buries the identity of the ringi under the
   * detail of it. **Already escaped or sanitised by the caller**, the same
   * contract as `bodyHtml`.
   */
  appendixHtml?: string;
  /**
   * Which of the five steps this message is about, drawn as the strip the
   * approval screen shows across its top.
   *
   * Optional because not every message has one: a hand-written note from the
   * composer is about the ringi, not about a step of it. The strip must agree
   * with `ctaHref`'s `?step=` - it is the picture of what the button opens, and
   * two answers to "where is this" is worse than none.
   */
  currentStep?: ApprovalStep;
  ctaLabel: string;
  /** Absolute URL, already escaped by the caller. */
  ctaHref: string;
  /**
   * **Approve and Send back, as two buttons**, for a message asking its reader
   * to answer a stage. Each opens the ringi with the dialog for that answer
   * already up (`lib/approval/mail-answer.ts`); nothing is recorded until the
   * reader confirms there, and the line under the buttons says so (rule 10).
   * With it, the `cta` pair becomes a plain link beneath them - for reading
   * the ringi first. Absolute URLs, already escaped by the caller.
   */
  decision?: { approveHref: string; sendBackHref: string };
  /** The grey line at the very bottom. Plain text. */
  footnote: string;
  /** `WIDE_MAIL_WIDTH` instead of `MAIL_WIDTH` - for a message whose appendix is a grid. */
  wide?: boolean;
}

/** The one filled button. */
function renderCta(label: string, href: string): string {
  return `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${HOYA_BLUE};border-radius:10px">
                  <a href="${href}"
                     style="display:inline-block;padding:13px 26px;font-family:${FONT_STACK};
                            font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">
                    ${escapeHtml(label)}
                  </a>
                </td>
              </tr>
            </table>`;
}

/**
 * Approve filled, Send back outlined - one hue at two weights, never a second
 * colour for the second answer (rule 33). A table of two cells rather than two
 * inline blocks: Word lays out a table and ignores `inline-block`.
 */
function renderDecision(
  decision: { approveHref: string; sendBackHref: string },
  openLabel: string,
  openHref: string
): string {
  return `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${HOYA_BLUE};border:2px solid ${HOYA_BLUE};border-radius:10px">
                  <a href="${decision.approveHref}"
                     style="display:inline-block;padding:11px 30px;font-family:${FONT_STACK};
                            font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">
                    Approve
                  </a>
                </td>
                <td style="width:12px;font-size:0;line-height:0">&nbsp;</td>
                <td style="background:#ffffff;border:2px solid ${HOYA_BLUE};border-radius:10px">
                  <a href="${decision.sendBackHref}"
                     style="display:inline-block;padding:11px 26px;font-family:${FONT_STACK};
                            font-size:15px;font-weight:600;color:${HOYA_BLUE};text-decoration:none">
                    Send back
                  </a>
                </td>
              </tr>
            </table>
            <div style="padding-top:12px;font-size:13px;line-height:1.5;color:${WARM_BLACK}">
              Either button opens the application and asks you to confirm there - nothing is
              recorded until you do.
              <a href="${openHref}" style="color:${HOYA_BLUE};text-decoration:underline">${escapeHtml(openLabel)}</a>
              to read it first.
            </div>`;
}

function renderFacts(facts: MailFact[]): string {
  if (facts.length === 0) return "";

  const rows = facts
    .map(
      (fact) => `
        <tr>
          <td style="padding:6px 16px 6px 0;font-size:12px;color:${COOL_GREY};
                     white-space:nowrap;vertical-align:top">${escapeHtml(fact.label)}</td>
          <td style="padding:6px 0;font-size:${fact.strong ? "16px" : "15px"};
                     color:${WARM_BLACK};font-weight:${fact.strong ? "700" : "400"}">
            ${escapeHtml(fact.value)}
          </td>
        </tr>`
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${FACT_BG};border:1px solid ${CARD_BORDER};border-radius:10px;
                  margin:24px 0">
      <tr>
        <td style="padding:16px 20px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>
        </td>
      </tr>
    </table>`;
}

/**
 * **Where the ringi stands, drawn the way the screen draws it** - five numbered
 * circles, the current one filled, the cleared ones ticked.
 *
 * Written to survive Word, which renders Outlook on Windows: no flexbox, so the
 * row is a table of five 20% cells; no `border-radius`, so the circles arrive as
 * squares and lose nothing; a background colour on a `<td>` is the one way to
 * draw the connecting line, which is why each cell is three cells - line,
 * circle, line - rather than a border on a container.
 *
 * The line into a step is blue when that step has been reached, the same rule
 * `ProgressStepper` uses, so the two pictures cannot drift.
 *
 * **The caption is not decoration.** Outlook's dark mode repaints backgrounds
 * and some clients drop colour altogether; a strip whose only statement of
 * "you are here" is a fill would then say nothing. The sentence says it in
 * words (rule 10).
 */
function renderSteps(current: ApprovalStep): string {
  const last = APPROVAL_STEPS[APPROVAL_STEPS.length - 1].id;

  /**
   * The connector, and the one part of this that has to be built rather than
   * declared. **A background on the `<td>` itself paints the whole cell** - the
   * row is as tall as the 28px circle beside it, so `height="2"` is a minimum
   * the row overrules and the "line" arrives as a 28px slab. The colour goes on
   * a nested 2px table instead, which the outer cell then centres.
   */
  const line = (colour: string) => `
    <td valign="middle" style="padding:0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td height="2"
              style="height:2px;line-height:2px;font-size:2px;background:${colour}">&nbsp;</td>
        </tr>
      </table>
    </td>`;

  const cells = APPROVAL_STEPS.map((step) => {
    const active = step.id === current;
    const done = step.id < current;

    const circleBg = active ? HOYA_BLUE : done ? STEP_DONE_BG : "#ffffff";
    const circleBorder = active || done ? HOYA_BLUE : STEP_LINE;
    const circleText = active ? "#ffffff" : done ? HOYA_BLUE : COOL_GREY;
    // The ends of the strip have no neighbour to reach: white, not
    // `transparent`, which is a keyword Word is not reliable about.
    const lineIn = step.id === 1 ? "#ffffff" : done || active ? HOYA_BLUE : STEP_LINE;
    const lineOut = step.id === last ? "#ffffff" : done ? HOYA_BLUE : STEP_LINE;

    return `
      <td width="20%" align="center" valign="top" style="width:20%;font-family:${FONT_STACK}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${line(lineIn)}
            <td valign="middle" width="28" style="width:28px;padding:0 4px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="28"
                     style="width:28px">
                <tr>
                  <td align="center" height="28"
                      style="height:28px;line-height:28px;background:${circleBg};
                             border:1px solid ${circleBorder};border-radius:14px;
                             font-family:${FONT_STACK};font-size:12px;font-weight:700;
                             color:${circleText}">${done ? "&#10003;" : step.id}</td>
                </tr>
              </table>
            </td>
            ${line(lineOut)}
          </tr>
        </table>
        <div style="padding:6px 2px 0;font-size:11px;line-height:1.3;
                    font-weight:${active ? "700" : "400"};
                    color:${active ? HOYA_BLUE : done ? WARM_BLACK : COOL_GREY}">
          ${escapeHtml(step.label)}
        </div>
      </td>`;
  }).join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="padding:0 0 10px;font-family:${FONT_STACK};font-size:11px;
                   color:${COOL_GREY}">
          Now on step ${current} of ${APPROVAL_STEPS.length} &mdash;
          ${escapeHtml(approvalStepName(current))}
        </td>
      </tr>
      <tr>
        <td>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>${cells}</tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * **The `[TEST]` strip** put above a ringi message while the Ringi preview is
 * on and somebody outside the trial is among its recipients
 * (`lib/auth/ringi-preview`, applied in `sendGraphMail`).
 *
 * A block of its own above the card rather than a slot inside it, because the
 * decision is made at the send, after the message is built - and on the page
 * colour, so the two read as one surface. Outlined HOYA Blue, one hue: a state,
 * not an alarm (rule 33); `#0057BC` on white is 6.9:1.
 */
export function renderTestNotice(wide = false): string {
  const width = mailWidth(wide);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${PAGE_BG};margin:0;padding:24px 0 0">
  <tr>
    <td align="center" style="padding:0 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}"
             style="width:${width}px;max-width:100%;background:#ffffff;border:2px solid ${HOYA_BLUE};
                    border-radius:10px">
        <tr>
          <td style="padding:12px 18px;font-family:${FONT_STACK};font-size:14px;line-height:1.5;
                     color:${HOYA_BLUE}">
            <strong>TEST</strong> - this message comes from the Ringi application preview. The
            application it is about is a test, not a real approval request, and you do not
            need to act on it.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/**
 * The whole message, ready for `sendGraphMail`.
 *
 * The button is a table cell with a background colour rather than a styled
 * `<a>`: in Word-rendered Outlook, padding on an inline element collapses and
 * the "button" arrives as bare blue text.
 *
 * **The step strip is a band under the letterhead, not a block in the message** -
 * the same place, and the same rule under it, as the stepper on the approval
 * screen. Where a ringi stands is context for everything below it, so it is read
 * before the sentence rather than after the facts.
 */
export function renderMailShell(input: MailShellInput): string {
  const width = mailWidth(input.wide);
  const notice = input.noticeHtml
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="margin:20px 0">
         <tr>
           <td style="padding:14px 18px;background:#fff8e6;border-left:3px solid #f59e0b;
                      border-radius:0 8px 8px 0;font-size:14px;color:${WARM_BLACK}">
             ${input.noticeHtml}
           </td>
         </tr>
       </table>`
    : "";

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${PAGE_BG};margin:0;padding:24px 0">
  <tr>
    <td align="center" style="padding:0 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}"
             style="width:${width}px;max-width:100%;background:#ffffff;border:1px solid ${CARD_BORDER};
                    border-radius:14px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(45,42,40,0.06)">

        <tr>
          <td style="background:${HOYA_BLUE};padding:18px ${MAIL_PADDING_X}px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:${FONT_STACK};font-size:15px;font-weight:700;
                           color:#ffffff;letter-spacing:0.02em">Invoice Portal</td>
                <td align="right" style="font-family:${FONT_STACK};font-size:11px;
                           color:#cfe4fa;text-transform:uppercase;letter-spacing:0.08em">
                  Create and manage invoices
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:${TONE_STYLES[input.tone ?? "info"].background};
                     padding:10px ${MAIL_PADDING_X}px;font-family:${FONT_STACK};font-size:11px;
                     font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                     color:${TONE_STYLES[input.tone ?? "info"].text}">
            ${escapeHtml(input.eyebrow)}
          </td>
        </tr>

        ${
          input.currentStep
            ? `<tr>
          <td style="padding:20px ${MAIL_PADDING_X}px 16px;border-bottom:1px solid ${CARD_BORDER}">
            ${renderSteps(input.currentStep)}
          </td>
        </tr>`
            : ""
        }

        <tr>
          <td style="padding:24px ${MAIL_PADDING_X}px 8px;font-family:${FONT_STACK}">
            <div style="font-size:15px;line-height:1.6;color:${WARM_BLACK}">
              ${input.bodyHtml}
            </div>
            ${
              input.calloutHtml
                ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                          style="margin:16px 0 4px">
                     <tr>
                       <td style="padding:14px 18px;background:${HOYA_BLUE};border-radius:8px;
                                  font-size:15px;line-height:1.5;color:#ffffff">
                         ${input.calloutHtml}
                       </td>
                     </tr>
                   </table>`
                : ""
            }
            ${renderFacts(input.facts)}
            ${notice}
            ${input.appendixHtml ?? ""}
          </td>
        </tr>

        <tr>
          <td style="padding:0 ${MAIL_PADDING_X}px 28px;font-family:${FONT_STACK}">
            ${input.decision ? renderDecision(input.decision, input.ctaLabel, input.ctaHref) : renderCta(input.ctaLabel, input.ctaHref)}
          </td>
        </tr>

        <tr>
          <td style="padding:16px ${MAIL_PADDING_X}px;background:${FACT_BG};border-top:1px solid ${CARD_BORDER};
                     font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${COOL_GREY}">
            ${escapeHtml(input.footnote)}
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>`;
}
