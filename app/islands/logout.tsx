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
    <button
      class="cursor-pointer rounded border border-gray-300 px-4 py-2"
      onClick={handleLogout}
      type="button"
    >
      ログアウト
    </button>
  );
};
