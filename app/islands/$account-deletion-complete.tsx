import { useEffect, useState } from "hono/jsx";

export default function AccountDeletionComplete() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    history.replaceState(null, "", "/login");
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="toast toast-bottom toast-end">
      <div className="alert alert-soft alert-success" role="status">
        <span>退会が完了しました。</span>
        <button
          aria-label="退会完了通知を閉じる"
          className="btn btn-ghost btn-sm"
          onClick={() => setVisible(false)}
          type="button"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
