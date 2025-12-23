import { createRoute } from "honox/factory";

export default createRoute((c) => {
  return c.render(
    <div class="py-8 text-center">
      <p>index</p>
    </div>,
  );
});
