import type { CSSProperties } from "react";

type AmbientArtworkBackgroundProps = {
  imageUrl: string | null | undefined;
};

export function AmbientArtworkBackground({
  imageUrl,
}: AmbientArtworkBackgroundProps) {
  if (!imageUrl) return null;

  const artworkStyle: CSSProperties = {
    backgroundImage: `url(${JSON.stringify(imageUrl)})`,
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[34rem] overflow-hidden md:left-56"
    >
      <div
        className="absolute -inset-x-32 -top-28 h-[34rem] scale-110 bg-cover bg-center opacity-55 blur-3xl saturate-125"
        style={artworkStyle}
      />
      <div className="absolute inset-0 bg-background/25" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/75 to-background" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/35 via-transparent to-background/45" />
    </div>
  );
}
