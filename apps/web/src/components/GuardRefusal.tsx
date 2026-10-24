/**
 * Shown when the state machine or permissions refuse an action. The refusal
 * text comes from the guard itself — the interface only relays it.
 */
export function GuardRefusal({ refusal }: { refusal: string }) {
  return (
    <p role="alert" className="rounded-md bg-routine-tint px-3 py-2 text-[13px] text-ink">
      <span className="font-medium">The system refused this action.</span> {refusal}
    </p>
  );
}
