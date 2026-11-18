// Pins "now" for tests/inside-canvas-test.js: its fixtures mix dates relative to today with the absolute dates of the
// cc-manha Plano de Ensino (rules/), so as the term goes by an exam date becomes overdue and the expected counts drift.
// The clock starts at a mid-term moment and keeps ticking (timers and Date.now() differences still work).
// Move FIXED_NOW when the rules of a new term replace the old ones.
const FIXED_NOW = Date.parse("2026-11-10T15:00:00-03:00"), RealDate = Date, start = RealDate.now();
const now = () => FIXED_NOW + (RealDate.now() - start);
class FixedDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(now()); }
  static now() { return now(); }
}
global.Date = FixedDate;
