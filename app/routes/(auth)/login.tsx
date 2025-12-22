import { createRoute } from "honox/factory";
import { LoginButton } from "../../islands/login";

export default createRoute((c) => {
  return c.render(
    <div class="py-8 text-center">
      <title>Login</title>
      <h1 class="font-bold text-3xl">Login Page!</h1>
      <LoginButton />
    </div>,
  );
});
