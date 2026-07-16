import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "../../contexts/AdminContext";
import { BakedLogo } from "../../components/layout/BakedLogo";
import { Button } from "../../components/ui/button";
import { Lock, Mail } from "lucide-react";
import { toast } from "sonner";

export const AdminLoginPage = () => {
  const { login } = useAdmin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back, admin");
      navigate("/admin", { replace: true });
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <form onSubmit={submit} className="baked-card bg-card border border-border p-8 w-full max-w-md space-y-5">
        <div className="flex justify-center"><BakedLogo size="lg" /></div>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Super Admin</h1>
          <p className="text-xs text-muted-foreground mt-1">BAKĒD Platform Operations</p>
        </div>
        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input data-testid="admin-login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@bakedplatform.com" className="baked-input w-full pl-10 pr-3 py-3 bg-secondary text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input data-testid="admin-login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="baked-input w-full pl-10 pr-3 py-3 bg-secondary text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <Button data-testid="admin-login-submit" disabled={busy} type="submit" className="w-full h-12 baked-btn font-semibold" style={{ backgroundColor: "#1D9BF0", color: "white" }}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
};
