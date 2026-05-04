// Sentinel exchanged between SettingsForm and actions.ts when the user did
// not retype the API key. Lives in its own module because actions.ts is
// "use server" and may only export async functions.
export const KEY_UNCHANGED_SENTINEL = "__UNCHANGED__";
