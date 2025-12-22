import { authClient } from "../utils/authClient";

export const LoginButton = () => {
  const handleLogin = async () => {
    alert("Login button clicked");
    // await authClient.signIn.social({
    //   provider: "github",
    //   callbackURL: "/",
    // });
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
