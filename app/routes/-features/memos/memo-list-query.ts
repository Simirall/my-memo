export type MemoListSort = "asc" | "desc";
export type MemoListType = "ai" | "link" | "normal";
export type MemoListAttachment = "with" | "without";

export type MemoListQuery = {
  sort: MemoListSort;
  type?: MemoListType;
  attachment?: MemoListAttachment;
  tag?: string;
};

const readSingleValue = (
  searchParams: URLSearchParams,
  name: string,
): string | undefined => {
  const values = searchParams.getAll(name);
  return values.length === 1 && values[0] ? values[0] : undefined;
};

export const parseMemoListQuery = (
  searchParams: URLSearchParams,
  ownedTagIds: ReadonlySet<string>,
): MemoListQuery => {
  const sortValue = readSingleValue(searchParams, "sort");
  const typeValue = readSingleValue(searchParams, "type");
  const attachmentValue = readSingleValue(searchParams, "attachment");
  const tagValue = readSingleValue(searchParams, "tag");

  return {
    sort: sortValue === "asc" ? "asc" : "desc",
    type:
      typeValue === "ai" || typeValue === "link" || typeValue === "normal"
        ? typeValue
        : undefined,
    attachment:
      attachmentValue === "with" || attachmentValue === "without"
        ? attachmentValue
        : undefined,
    tag: tagValue && ownedTagIds.has(tagValue) ? tagValue : undefined,
  };
};

export const toMemoListSearchParams = (query: MemoListQuery) => {
  const searchParams = new URLSearchParams();
  if (query.sort === "asc") searchParams.set("sort", "asc");
  if (query.type) searchParams.set("type", query.type);
  if (query.attachment) searchParams.set("attachment", query.attachment);
  if (query.tag) searchParams.set("tag", query.tag);
  return searchParams;
};

export const buildMemoListUrl = (pathname: string, query: MemoListQuery) => {
  const search = toMemoListSearchParams(query).toString();
  return search ? `${pathname}?${search}` : pathname;
};

export const replaceMemoListTag = (
  pathname: string,
  query: MemoListQuery,
  tag: string,
) => buildMemoListUrl(pathname, { ...query, tag });

export const getSafeMemoListReturnTo = (
  value: string | undefined,
  ownedTagIds: ReadonlySet<string>,
) => {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";

  const url = new URL(value, "https://my-memo.invalid");
  if (
    url.hash ||
    (url.pathname !== "/" && !/^\/categories\/[^/?#]+$/.test(url.pathname))
  ) {
    return "/";
  }

  return buildMemoListUrl(
    url.pathname,
    parseMemoListQuery(url.searchParams, ownedTagIds),
  );
};
