export default function Share() {
  return (
    <div className="flex min-h-[50svh] items-center justify-center p-8">
      <title>共有 | My Memo</title>
      <div className="alert alert-info max-w-md" role="status">
        このページは、端末の共有メニューからコンテンツを受け取るために使用します。
      </div>
    </div>
  );
}
export const getConfig = () => ({ render: "dynamic" as const });
