import type { Tag } from "@/features/tags/data/tags";

export const addMemoListTagOptions = (tags: ReadonlyArray<Tag>) => {
  const select = document.getElementById(
    "memo-tag",
  ) as unknown as HTMLSelectElement | null;
  if (!select) return;

  for (const tag of tags) {
    const exists = Array.from(select.options).some(
      (option) => option.value === tag.id,
    );
    if (!exists) {
      const option = document.createElement("option");
      option.value = tag.id;
      option.textContent = `#${tag.name}`;
      select.add(option);
    }
  }

  const options = Array.from(select.options)
    .slice(1)
    .sort((a, b) => a.text.localeCompare(b.text, "ja"));
  for (const option of options) select.add(option);
};

export const removeMemoCardFromList = (memoId: string) => {
  const card = document.querySelector<HTMLElement>(
    `[data-memo-card="${CSS.escape(memoId)}"]`,
  );
  if (!card) return;
  card.remove();

  if (document.querySelector("[data-memo-card]")) return;
  const existingEmpty = document.querySelector<HTMLElement>(
    "[data-memo-list-empty]",
  );
  if (existingEmpty) {
    existingEmpty.removeAttribute("hidden");
    return;
  }

  const empty = document.createElement("p");
  empty.className =
    "rounded-box bg-base-200 p-6 text-center text-base-content/70";
  empty.dataset.memoListEmpty = "";
  empty.textContent = "条件に一致するメモはありません。";
  const grid = document.querySelector("[data-memo-list-grid]");
  if (grid?.parentNode) {
    grid.parentNode.insertBefore(empty, grid.nextSibling);
  }
};
