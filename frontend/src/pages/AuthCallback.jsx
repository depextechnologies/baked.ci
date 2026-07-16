import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/BakedContexts";
import { toast } from "sonner";

// Handles Emergent Google Auth callback via URL fragment #session_id=...
export const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithToken } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = location.hash || window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");
    if (!sessionId) { navigate("/", { replace: true }); return; }

    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sessionId });
        await loginWithToken(data.access_token, data.customer);
        toast.success(`Welcome, ${data.customer.name || "back"}!`);
      } catch (e) {
        toast.error("Google sign-in failed");
      } finally {
        window.history.replaceState(null, "", "/");
        navigate("/", { replace: true });
      }
    })();
  }, [location, navigate, loginWithToken]);

  return (
    <div className="baked-container my-24 text-center text-sm text-muted-foreground">Signing you in…</div>
  );
};
