import React from "react";
import { useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "../ui/button";
import { useAuth } from "../../contexts/BakedContexts";

/**
 * GuestSignInPrompt — shown on any protected profile-family page when the
 * customer isn't authenticated. Uses AuthContext.openLogin() which stores the
 * current path so the user is returned here after successful sign-in.
 */
export const GuestSignInPrompt = ({ title = "Sign in required", message = "Sign in to your BAKĒD account to continue.", testid = "guest-signin-prompt" }) => {
  const { openLogin } = useAuth();
  const loc = useLocation();
  return (
    <div data-testid={testid} className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
        <ShieldCheck size={36} />
      </div>
      <div className="text-lg font-bold">{title}</div>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{message}</p>
      <Button
        data-testid={`${testid}-btn`}
        onClick={() => openLogin(loc.pathname + loc.search)}
        className="baked-btn mt-6 h-11 px-6 font-bold text-black"
        style={{ backgroundColor: "#77BC1F" }}
      >
        Continue to sign in
      </Button>
    </div>
  );
};
