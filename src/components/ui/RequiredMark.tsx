/**
 * The `*` that means "this one cannot be left blank".
 *
 * **One spelling, because it was seventeen.** `<span className="text-red-500">*</span>`
 * appeared across ten screens at three different sizes, and the smallest of
 * them - `text-xs`, absolutely positioned half over the Entity dropdown on New
 * CAPEX Schedule - was the one somebody missed entirely: they filled the form,
 * found Create Schedule grey, and could not see which field was unanswered
 * (reported 2026-09-16). A mark nobody notices marks nothing.
 *
 * `text-lg` rather than the `text-sm` it inherited, because an asterisk is not
 * the size of its font: the glyph is drawn in the upper third of the em box, so
 * it reads roughly half the height of the letters beside it. 18px here sits
 * about level with 14px text. `translate-y` brings it down off the cap line so
 * it centres against the label rather than floating above it.
 *
 * **Red, and staying red.** It is not a new colour - every one of those
 * seventeen was already red, it is the convention for a required field, and a
 * marker the reader must not miss is the one thing rule 33 keeps red for.
 *
 * Not `aria-hidden`: "star" is how a screen reader conveys this, and the card
 * heading above these fields says what the mark means.
 */
export function RequiredMark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-red-500 text-lg leading-none translate-y-[0.12em] ${className}`}>
      *
    </span>
  );
}

export default RequiredMark;
