import { useEffect, useRef } from "hono/jsx";

type FormRef = {
  current: HTMLFormElement | null;
};

const handledShortcutEvents = new WeakSet<KeyboardEvent>();

export const useFormSubmitShortcut = (formRef: FormRef, disabled = false) => {
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const submitWithCtrlEnter = (event: KeyboardEvent) => {
      if (
        disabledRef.current ||
        !event.ctrlKey ||
        event.key !== "Enter" ||
        event.isComposing
      ) {
        return;
      }

      const form = formRef.current;
      if (!form?.isConnected) return;

      const eventForm =
        event.target instanceof Element ? event.target.closest("form") : null;
      if (eventForm && eventForm !== form) return;
      if (handledShortcutEvents.has(event)) return;

      handledShortcutEvents.add(event);
      event.preventDefault();
      form.requestSubmit();
    };

    window.addEventListener("keydown", submitWithCtrlEnter, { capture: true });
    return () =>
      window.removeEventListener("keydown", submitWithCtrlEnter, {
        capture: true,
      });
  }, [formRef]);
};
