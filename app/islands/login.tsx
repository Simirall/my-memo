import { authClient } from "../utils/authClient";

export const LoginButton = ({ callbackURL }: { callbackURL?: string }) => {
  const handleLogin = async () => {
    await authClient.signIn.social({
      callbackURL,
      provider: "github",
    });
  };

  return (
    <button class="btn" onClick={handleLogin} type="button">
      GitHubでログイン
    </button>
  );
};
