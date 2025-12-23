import { authClient } from "../utils/authClient";

export const LoginButton = () => {
  const handleLogin = async () => {
    await authClient.signIn.social({
      provider: "github",
    });
  };

  return (
    <button class="btn" onClick={handleLogin} type="button">
      GitHubでログイン
    </button>
  );
};
