export function buildSevenDigitalUrl({
  artistName,
  albumTitle,
}: {
  artistName: string;
  albumTitle?: string;
}): string {
  const term = albumTitle ? `${artistName} ${albumTitle}` : artistName;
  return `https://www.7digital.com/search?q=${encodeURIComponent(term)}`;
}
