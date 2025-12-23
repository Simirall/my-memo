import { authClient } from "../utils/authClient";

export const LogoutButton = () => {
  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          location.reload();
        },
      },
    });
  };

  return (
    <button class="btn" onClick={handleLogout} type="button">
      ログアウト
    </button>
  );
};
