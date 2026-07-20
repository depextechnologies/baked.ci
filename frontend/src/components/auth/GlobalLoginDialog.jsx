import React from "react";
import { useAuth } from "../../contexts/BakedContexts";
import { PhoneLoginDialog } from "./PhoneLoginDialog";

/**
 * GlobalLoginDialog — a single instance of the login dialog wired to
 * AuthContext state (loginOpen / closeLogin). Rendered once at the
 * CustomerShell level so any component (desktop or mobile) can invoke it
 * via useAuth().openLogin().
 */
export const GlobalLoginDialog = () => {
  const { loginOpen, closeLogin } = useAuth();
  return <PhoneLoginDialog open={loginOpen} onOpenChange={(v) => (v ? null : closeLogin())} />;
};
