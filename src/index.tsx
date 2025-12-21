import { Hono } from "hono";
import { authRoute } from "./features/auth/routes";
import { renderer } from "./renderer";

const app = new Hono();

app.use(renderer);

app.get("/", (c) => {
  return c.render(<h1>Hello!</h1>);
});

app.route("/api", authRoute);

export default app;
