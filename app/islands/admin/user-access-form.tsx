import { useState } from "hono/jsx";

type UserAccessFormProps = {
  user: { id: string; role: string; planId: string };
  plans: ReadonlyArray<{ id: string; name: string }>;
};

export default function UserAccessForm({ user, plans }: UserAccessFormProps) {
  const [role, setRole] = useState(user.role);
  const [planId, setPlanId] = useState(user.planId);
  const [message, setMessage] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setMessage(undefined);
    setIsSaving(true);
    try {
      const body = new URLSearchParams({ role, planId });
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "POST",
        body,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const payload = (await response.json()) as {
        message?: string;
        code?: string;
      };
      if (!response.ok) {
        setMessage(payload.message ?? "変更を保存できませんでした。");
        return;
      }
      setMessage("保存しました。");
    } catch {
      setMessage("通信に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      action={`/api/admin/users/${user.id}`}
      className="flex flex-wrap items-end gap-2"
      method="post"
      onSubmit={submit}
    >
      <label
        className="flex flex-col gap-1 text-sm"
        htmlFor={`role-${user.id}`}
      >
        Role
        <select
          className="select select-sm"
          id={`role-${user.id}`}
          name="role"
          onChange={(event) =>
            setRole((event.currentTarget as HTMLSelectElement).value)
          }
        >
          <option selected={role === "user"} value="user">
            user
          </option>
          <option selected={role === "admin"} value="admin">
            admin
          </option>
        </select>
      </label>
      <label
        className="flex flex-col gap-1 text-sm"
        htmlFor={`plan-${user.id}`}
      >
        Plan
        <select
          className="select select-sm"
          id={`plan-${user.id}`}
          name="planId"
          onChange={(event) =>
            setPlanId((event.currentTarget as HTMLSelectElement).value)
          }
        >
          {plans.map((plan) => (
            <option key={plan.id} selected={plan.id === planId} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-sm" disabled={isSaving} type="submit">
        {isSaving ? "Saving…" : "Save"}
      </button>
      {message && (
        <span aria-live="polite" className="text-sm" role="status">
          {message}
        </span>
      )}
    </form>
  );
}
