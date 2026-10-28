import { AppLink } from "@/components/app-link";
export default function NotFound() {
  return (
    <div className="space-y-4 p-4 text-center">
      <title>ページが見つかりません | My Memo</title>
      <h1 className="text-4xl font-bold">ページが見つかりません</h1>
      <p>URLが正しいか確認してください。</p>
      <AppLink className="btn" href="/">
        メモ一覧へ戻る
      </AppLink>
    </div>
  );
}
export const getConfig = () => ({ render: "dynamic" as const });
