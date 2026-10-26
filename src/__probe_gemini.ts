// CAL-018 AC-7 control. A deliberately offending module: it names the Gemini
// host (generativelanguage.googleapis.com), which no source file under src/
// or shared/ may do. It is named __probe_* so paths.conf classifies it as
// `test`, the source enumerator skips it, and src/geminiBoundary.test.ts can
// assert that the guard's scanning function DOES report it. Nothing but that
// test imports it, so it never reaches the bundle.

export const PROBE_GEMINI_HOST = "generativelanguage.googleapis.com";
