import Image from "next/image";

/** Renders a generated editorial diagram without coupling marketing pages to workspace state. */
export function MarketingScenePreview({
  src,
  alt,
  compact = false,
  parallax = false
}: {
  src: string;
  alt: string;
  compact?: boolean;
  parallax?: boolean;
}) {
  return (
    <div
      className={`marketing-diagram-preview ${compact ? "is-compact" : ""}`}
      data-parallax-media={parallax ? "" : undefined}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={compact ? "(max-width: 1024px) 100vw, 42vw" : "(max-width: 720px) 100vw, 33vw"}
      />
    </div>
  );
}
