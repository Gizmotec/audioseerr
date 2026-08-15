/**
 * Ceiling on a single multi-select batch. Matches the cap addTracksToPlaylist
 * already enforces, so the library's selection bar can warn before the round
 * trip instead of after. Lives in its own module because both a "use server"
 * action file (which may only export async functions) and a client component
 * need to read it.
 */
export const MAX_BULK_TRACKS = 200;
