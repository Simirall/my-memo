import type { LinkPreview } from "@/features/link-preview/server/link-preview-cache";

export const LinkPreviewCard = ({
  preview,
  url,
}: {
  preview: LinkPreview;
  url: string;
}) => {
  const isLarge = preview.cardType === "summary_large_image";
  const imageWidth = isLarge ? 160 : 96;

  return (
    <a
      aria-label={`リンクプレビュー: ${preview.title}`}
      className="flex h-24 min-w-0 overflow-clip rounded border border-base-300 bg-base-100 text-base-content transition-colors hover:bg-base-300 focus-visible:outline-2 focus-visible:outline-offset-2"
      data-link-preview
      href={url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {preview.imageUrl && (
        <img
          alt=""
          className={`${isLarge ? "w-40" : "w-24"} h-24 shrink-0 object-cover`}
          data-link-preview-image={preview.cardType}
          height={96}
          loading="lazy"
          referrerPolicy="no-referrer"
          src={preview.imageUrl}
          width={imageWidth}
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2">
        <span className="truncate font-bold">{preview.title}</span>
        {preview.description && (
          <span className="line-clamp-3 text-base-content/70 text-xs">
            {preview.description}
          </span>
        )}
      </span>
    </a>
  );
};
