"use client";

import { authClient } from "@/auth/auth-client";

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
    <button className="btn mx-auto" onClick={handleLogout} type="button">
      ログアウト
    </button>
  );
};
