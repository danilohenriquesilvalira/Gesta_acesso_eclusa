import { useState, useCallback } from "react";

interface AuthState {
  username: string;
  role:     string;
  token:    string;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState | null>(null);

  const login = useCallback((username: string, token: string, role: string) => {
    setAuth({ username, token, role });
  }, []);

  const logout = useCallback(() => setAuth(null), []);

  return {
    username:        auth?.username ?? "",
    token:           auth?.token   ?? "",
    role:            auth?.role    ?? "",
    isAuthenticated: auth !== null,
    isAdmin:         auth?.role === "admin",
    login,
    logout,
  };
}
