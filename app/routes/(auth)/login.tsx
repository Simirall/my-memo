import { createRoute } from "honox/factory";
import { LoginButton } from "../../islands/login";

export default createRoute((c) => {
  return c.render(
    <div className="hero min-h-[calc(100svh-4rem)] bg-base-200">
      <div className="hero-content text-center">
        <div className="space-y-4">
          <h1 className="font-bold text-5xl">My Memo</h1>
          <LoginButton />
        </div>
      </div>
    </div>,
  );
});
