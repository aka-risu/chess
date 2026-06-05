// lib/mode.ts
// Test mode: a local-only sandbox enabled with the `?test` URL flag. While on,
// the data layer (lib/supabase.ts) reads/writes an in-memory snapshot seeded
// from the live data and NEVER writes to the database. The flag is remembered in
// sessionStorage so it survives tab navigation; visit `?test=off` or use the
// banner's Exit button to leave.
const TEST_KEY = "swiss_test_mode";
const OFF = new Set(["0", "off", "false", "no"]);

export function isTestMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("test")) {
      const v = params.get("test") ?? "";
      if (OFF.has(v)) { sessionStorage.removeItem(TEST_KEY); return false; }
      sessionStorage.setItem(TEST_KEY, "1");
      return true;
    }
    return sessionStorage.getItem(TEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function exitTestMode(): void {
  try { sessionStorage.removeItem(TEST_KEY); } catch { /* ignore */ }
}
