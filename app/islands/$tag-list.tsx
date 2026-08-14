import pencilSimpleIcon from "@phosphor-icons/core/assets/regular/pencil-simple.svg?raw";
import { useEffect, useRef, useState } from "hono/jsx";
import { PhosphorIcon } from "@/components/phosphor-icon";
import { MAX_TAG_NAME_LENGTH, type Tag } from "@/features/tags/data/tags";
import { DeleteButton } from "./$delete-button";

export const TagList = ({
  initialTags,
}: {
  initialTags: ReadonlyArray<Tag>;
}) => {
  const [tags, setTags] = useState([...initialTags]);
  const [editing, setEditing] = useState<Tag | undefined>();
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (!editing && dialog.open) {
      dialog.close();
    }
  }, [editing]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const closeEditor = () => {
    if (isSaving) return;
    setEditing(undefined);
    setError(undefined);
  };

  return (
    <div>
      <ul className="list rounded-box bg-base-200">
        {tags.map((tag) => (
          <li className="list-row items-center" key={tag.id}>
            <span className="list-col-grow font-semibold">#{tag.name}</span>
            <button
              aria-label={`タグ「${tag.name}」を編集`}
              className="btn btn-soft"
              onClick={(event) => {
                openerRef.current = event.currentTarget as HTMLButtonElement;
                setEditing(tag);
                setEditingName(tag.name);
                setError(undefined);
              }}
              type="button"
            >
              <PhosphorIcon svg={pencilSimpleIcon} />
            </button>
            <DeleteButton
              action={`/api/tags/delete/${tag.id}`}
              confirmMessage={`「#${tag.name}」を削除しますか？`}
              label={`タグ「${tag.name}」を削除`}
            />
          </li>
        ))}
      </ul>
      <dialog
        aria-label="タグ名を変更"
        className="modal modal-middle"
        closedby="any"
        onCancel={(event: Event) => {
          event.preventDefault();
          closeEditor();
        }}
        onClose={() => {
          if (editing) closeEditor();
          openerRef.current?.focus();
          openerRef.current = null;
        }}
        ref={dialogRef}
      >
        <div className="modal-box">
          <h2 className="font-bold text-lg">タグ名を変更</h2>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editing || isSaving) return;
              setIsSaving(true);
              setError(undefined);
              try {
                const response = await fetch(`/api/tags/rename/${editing.id}`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ name: editingName }),
                });
                const result = (await response.json().catch(() => ({}))) as {
                  message?: string;
                  name?: string;
                };
                if (!response.ok || !result.name) {
                  throw new Error(result.message ?? "保存できませんでした。");
                }
                setTags((current) =>
                  current
                    .map((tag) =>
                      tag.id === editing.id
                        ? { ...tag, name: result.name as string }
                        : tag,
                    )
                    .sort((left, right) => left.name.localeCompare(right.name)),
                );
                setEditing(undefined);
                setSaved(true);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "保存できませんでした。",
                );
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <label className="flex flex-col gap-1" htmlFor="edit-tag-name">
              <span>タグ名</span>
              <input
                className="input w-full"
                disabled={isSaving}
                id="edit-tag-name"
                maxLength={MAX_TAG_NAME_LENGTH}
                onInput={(event) =>
                  setEditingName(
                    (event.currentTarget as HTMLInputElement).value,
                  )
                }
                ref={inputRef}
                required
                type="text"
                value={editingName}
              />
            </label>
            <p className="text-base-content/70 text-sm">
              {MAX_TAG_NAME_LENGTH}文字以内で入力してください。
            </p>
            <div className="modal-action">
              <button
                className="btn"
                disabled={isSaving}
                onClick={closeEditor}
                type="button"
              >
                キャンセル
              </button>
              <button className="btn" disabled={isSaving} type="submit">
                {isSaving ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "保存"
                )}
              </button>
            </div>
          </form>
        </div>
        <button
          aria-label="タグ名の変更をキャンセル"
          className="modal-backdrop"
          disabled={isSaving}
          onClick={closeEditor}
          type="button"
        >
          キャンセル
        </button>
      </dialog>
      {saved && (
        <div className="toast toast-end toast-bottom pointer-events-none z-50">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="alert alert-soft alert-success pointer-events-auto w-[min(24rem,calc(100vw-2rem))] shadow-lg"
            role="status"
          >
            タグ名を変更しました。
          </div>
        </div>
      )}
    </div>
  );
};
