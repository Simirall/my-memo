---
name: handle-honox-islands
description: Diagnose, implement, and review HonoX island components safely across SSR and client hydration. Use for files under app/islands, interactive Hono JSX components, unexpected layout or alignment around islands, honox-island wrapper behavior, non-working Tailwind utilities such as mx-auto or w-full, and islands embedded in daisyUI menus, lists, forms, flex, or grid layouts.
---

# Handle HonoX Islands

Treat the generated island boundary as part of the DOM. Verify the installed HonoX behavior before changing layout or hydration code.

## Diagnose before editing

1. Inspect the rendered DOM and find the generated `<honox-island>` element.
2. Inspect both its computed style and the island component's root element.
3. Identify which element is the flex/grid item and which element owns the available width.
4. Check direct-child selectors from Tailwind, daisyUI, or custom CSS.
5. If behavior is uncertain, read the installed implementation at `node_modules/honox/dist/vite/components/honox-island.js`; do not rely on remembered HonoX versions.

HonoX wraps a server-rendered island approximately like this:

```html
<honox-island component-name="/app/islands/logout">
  <button class="btn mx-auto">ログアウト</button>
</honox-island>
```

Utilities on the button apply inside the generated wrapper. They do not style the wrapper itself. For example, `mx-auto` cannot visibly center the button when `<honox-island>` has only the button's intrinsic width.

## Fix wrapper-aware layout

Prefer a local parent rule that targets only the relevant island boundary:

```tsx
<ul className="menu [&>honox-island]:flex [&>honox-island]:w-full [&>honox-island]:justify-center">
  <LogoutButton />
</ul>
```

This makes the generated wrapper own the full row width, so the inner button's `mx-auto` has space to work with.

Alternatively, add a neutral server-rendered layout wrapper when it does not trigger component-library behavior:

```tsx
<div className="flex w-full justify-center">
  <LogoutButton />
</div>
```

Choose between these patterns by inspecting the surrounding component. In a daisyUI `menu`, adding an `li` only for alignment can introduce menu hover, padding, or active styles. Do not add semantic wrappers blindly.

## Guardrails

- Do not repeatedly add `mx-auto`, `w-full`, or `justify-center` to the island's inner element without checking the wrapper width.
- Do not assume a `className` prop passed to an island styles `<honox-island>`; it styles the component output unless the framework explicitly forwards it.
- Scope wrapper selectors to the nearest parent. Avoid global `honox-island` CSS because unrelated islands may require inline, grid, or intrinsic sizing.
- Keep event handlers and browser-only state inside the island. Do not move an interactive component out of `app/islands` merely to remove the wrapper.
- Avoid `window`, `document`, time-dependent values, random values, or browser-only measurements during SSR. Use event handlers or client effects.
- Pass serializable props across the island boundary. Keep element-valued props minimal and verify their template/hydration behavior.
- Preserve stable element order, IDs, and initial text between SSR and hydration.

## Component-library interactions

When placing an island inside daisyUI or another library:

1. Read the component's expected DOM structure.
2. Compare it with the actual DOM including `<honox-island>`.
3. Check selectors such as `> li`, `> button`, `:hover`, and flex/grid child rules.
4. Decide whether to style the island wrapper, add a neutral parent, or restructure the component.
5. Confirm that the fix does not add hover backgrounds, padding, focus behavior, or invalid nesting.

## Validate the real behavior

Do not stop at checking class strings.

- Run the browser tests and production build.
- Confirm Tailwind emitted arbitrary selectors for `honox-island` in the built CSS.
- Inspect the hydrated DOM, not only the source JSX.
- For alignment regressions, compare bounding-box centers:

```ts
const menuBox = menu.getBoundingClientRect();
const buttonBox = button.getBoundingClientRect();
const offset = Math.abs(
  buttonBox.left + buttonBox.width / 2 - (menuBox.left + menuBox.width / 2),
);
expect(offset).toBeLessThan(1);
```

- Test both authenticated role branches when menu contents differ.

## Review checklist

- Generated wrapper identified
- Flex/grid ownership identified
- Wrapper fix scoped locally
- daisyUI hover and focus states preserved
- SSR and hydrated markup consistent
- Browser test verifies geometry when layout is the bug
- Production build emits the required CSS
