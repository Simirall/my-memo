import type { Tag } from "./tags";

export const MemoTagList = ({ tags }: { tags: ReadonlyArray<Tag> }) => {
  const sortedTags = [...tags].sort((a, b) =>
    a.name.localeCompare(b.name, "ja"),
  );

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {sortedTags.map((tag) => (
        <li key={tag.id}>
          <a
            className="badge badge-soft badge-info hover:underline"
            href={`/tags/${tag.id}`}
          >
            #{tag.name}
          </a>
        </li>
      ))}
    </ul>
  );
};
