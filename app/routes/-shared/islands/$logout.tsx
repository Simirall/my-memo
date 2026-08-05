import { authClient } from "../auth-client";

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
    <button class="btn mx-auto" onClick={handleLogout} type="button">
      ログアウト
    </button>
  );
};
