import { createRoute } from "honox/factory";
import { LogoutButton } from "../islands/logout";

export default createRoute((c) => {
  return c.render(
    <div class="py-8 text-center">
      <p>index</p>
      <LogoutButton />
    </div>,
  );
});
