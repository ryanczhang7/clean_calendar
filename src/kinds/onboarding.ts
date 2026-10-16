// CAL-007, Contract Block 2: whether this device has finished the kinds
// walkthrough. One key, the string "1", nothing else stored. A storage that
// throws (private mode, a disabled policy) reads as not onboarded, and the
// mark is then a no-op - the walkthrough shows again, which is harmless.

export const ONBOARDED_KEY = "cc.onboarded";

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // Not remembered; see above.
  }
}
