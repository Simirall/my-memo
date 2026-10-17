import type { PageProps } from "waku/router";
import { MemoListPage } from "@/features/memos/list/memo-list-page";
import { loadMemoListPageData } from "@/features/memos/list/memo-list-page-data";
import { getRequestContext, redirect } from "@/server/request-context";

export default async function Page(props: PageProps<"/">) {
  const c = getRequestContext();
  const user = c.get("user");
  if (!user) {
    return redirect("/login");
  }

  const data = await loadMemoListPageData({
    c,
    path: props.path,
    queryString: props.query,
    userId: user.id,
  });
  if (data.emptyPageRedirect) return redirect(data.emptyPageRedirect);

  return <MemoListPage {...data} />;
}

export const getConfig = () => ({ render: "dynamic" as const });
