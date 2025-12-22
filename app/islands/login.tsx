import { authClient } from "../utils/authClient";

export const LoginButton = () => {
  const handleLogin = async () => {
    await authClient.signIn.social({
      provider: "github",
    });
  };

  return (
    <button
      class="cursor-pointer rounded border border-gray-300 px-4 py-2"
      onClick={handleLogin}
      type="button"
    >
      GitHubでログイン
    </button>
  );
};
