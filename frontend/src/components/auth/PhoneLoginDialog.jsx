import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { BakedLogo } from "../layout/BakedLogo";
import { AUTH } from "../../constants/testIds";
import { api } from "../../lib/api";
import { useAuth, useApp } from "../../contexts/BakedContexts";
import { toast } from "sonner";
import { Mail, ChevronLeft } from "lucide-react";
import { t } from "../../lib/i18n";

const COUNTRY_CODES = [
  { code: "+225", label: "🇨🇮 +225" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+91", label: "🇮🇳 +91" },
  { code: "+221", label: "🇸🇳 +221" },
  { code: "+233", label: "🇬🇭 +233" },
  { code: "+234", label: "🇳🇬 +234" },
  { code: "+254", label: "🇰🇪 +254" },
];

const OTP_LEN = 6;

export const PhoneLoginDialog = ({ open, onOpenChange }) => {
  const { loginWithToken } = useAuth();
  const { country, uiLocale } = useApp();
  const locale = uiLocale;
  const [step, setStep] = useState("phone"); // 'phone' | 'otp'
  const [countryCode, setCountryCode] = useState(country?.phone_code || "+225");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState(null); // { challenge_id, expires_in, dev_code? }
  const [otp, setOtp] = useState(Array(OTP_LEN).fill(""));
  const [timeLeft, setTimeLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const otpRefs = useRef([]);

  useEffect(() => { if (open) { setStep("phone"); setPhone(""); setOtp(Array(OTP_LEN).fill("")); setChallenge(null); } }, [open]);
  useEffect(() => {
    if (!challenge) return;
    setTimeLeft(challenge.expires_in);
    const iv = setInterval(() => setTimeLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [challenge]);

  const mmss = useMemo(() => {
    const m = String(Math.floor(timeLeft / 60)).padStart(2, "0");
    const s = String(timeLeft % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, [timeLeft]);

  const requestOtp = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 6) { toast.error("Please enter a valid phone number"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/otp/request", { country_code: countryCode, phone });
      setChallenge(data);
      setStep("otp");
      if (data.dev_code) toast(`Dev OTP: ${data.dev_code}`, { description: "Development mode — auto-filled" });
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (e) {
      toast.error("Could not send code. Please retry.");
    } finally { setBusy(false); }
  };

  const verifyOtp = async (codeOverride) => {
    const code = codeOverride || otp.join("");
    if (code.length !== OTP_LEN) { toast.error("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { challenge_id: challenge.challenge_id, code });
      await loginWithToken(data.access_token, data.customer);
      toast.success("Welcome to bakēd!");
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Verification failed");
    } finally { setBusy(false); }
  };

  const handleOtpChange = (i, v) => {
    const val = v.replace(/\D/g, "").slice(-1);
    let joined = "";
    setOtp((prev) => {
      const n = [...prev];
      n[i] = val;
      joined = n.join("");
      return n;
    });
    if (val && i < OTP_LEN - 1) otpRefs.current[i + 1]?.focus();
    // Auto-verify when the last box is filled and all 6 digits are present.
    if (val && i === OTP_LEN - 1 && /^\d{6}$/.test(joined)) {
      setTimeout(() => verifyOtp(joined), 30);
    }
  };

  const handleOtpKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < OTP_LEN - 1) otpRefs.current[i + 1]?.focus();
  };

  const startGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 border-border bg-background overflow-hidden">
        <DialogTitle className="sr-only">Sign in to bakēd</DialogTitle>
        <DialogDescription className="sr-only">
          Use your mobile number, Google, or email to sign in to your bakēd account.
        </DialogDescription>
        <div className="px-6 pt-6 pb-8 bg-background text-foreground">
          {step === "otp" && (
            <button data-testid={AUTH.changeNumberBtn} onClick={() => setStep("phone")} className="mb-2 -ml-2 p-2 hover:bg-secondary baked-btn motion-fast">
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex justify-center pt-2 pb-4">
            <BakedLogo size="lg" />
          </div>

          {step === "phone" ? (
            <>
              <h2 className="text-3xl sm:text-4xl font-semibold text-center leading-tight">
                {t(locale, "auth.welcome")} <span style={{ color: "#FF4C52" }}>{t(locale, "auth.your_world")}</span>
              </h2>
              <p className="text-center text-sm text-muted-foreground mt-2">{t(locale, "auth.one_account")}</p>

              <div className="mt-8 flex items-stretch gap-0 baked-input border border-border overflow-hidden bg-secondary/40">
                <select
                  data-testid={AUTH.countryCodeSelect}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-transparent px-3 py-4 outline-none text-sm border-r border-border"
                >
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input
                  data-testid={AUTH.phoneInput}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t(locale, "auth.phone_placeholder")}
                  className="flex-1 bg-transparent px-4 py-4 outline-none text-sm"
                  inputMode="tel"
                  onKeyDown={(e) => e.key === "Enter" && requestOtp()}
                />
              </div>

              <Button
                data-testid={AUTH.sendCodeBtn}
                onClick={requestOtp}
                disabled={busy}
                className="w-full mt-4 h-14 text-base font-semibold baked-btn"
                style={{ backgroundColor: "#FF4C52", color: "white" }}
              >
                {t(locale, "auth.send_code")}
              </Button>

              <div className="flex items-center gap-3 my-6">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{t(locale, "auth.or")}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <button data-testid={AUTH.googleBtn} onClick={startGoogle} className="w-full h-14 baked-btn border border-border hover:bg-secondary motion-fast flex items-center justify-center gap-3">
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                <span className="font-medium">{t(locale, "auth.continue_google")}</span>
              </button>

              <button data-testid={AUTH.emailBtn} className="w-full h-14 baked-btn border border-border hover:bg-secondary motion-fast flex items-center justify-center gap-3 mt-3" onClick={() => toast("Email login coming soon")}>
                <Mail size={18} />
                <span className="font-medium">{t(locale, "auth.continue_email")}</span>
              </button>

              <div className="text-center text-sm text-muted-foreground mt-6">
                {t(locale, "auth.no_account")}{" "}
                <button data-testid={AUTH.createAccountBtn} className="font-semibold" style={{ color: "#FF4C52" }} onClick={requestOtp}>
                  {t(locale, "auth.create")} →
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-3xl sm:text-4xl font-semibold text-center leading-tight">
                {t(locale, "auth.verify_title")} <span style={{ color: "#FF4C52" }}>{t(locale, "auth.verify_your")}</span>
              </h2>
              <p className="text-center text-sm text-muted-foreground mt-2">{t(locale, "auth.verify_sub")}</p>
              <p className="text-center text-base font-medium mt-1">{countryCode} {phone}</p>

              <div className="flex justify-center gap-3 mt-8">
                {otp.map((v, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    data-testid={AUTH.otpInput(i)}
                    value={v}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKey(i, e)}
                    inputMode="numeric"
                    maxLength={1}
                    className={`w-12 h-14 text-center text-2xl font-semibold bg-transparent border baked-input outline-none motion-fast ${v ? "border-[#FF4C52]" : "border-border"}`}
                  />
                ))}
              </div>

              <div className="text-center text-xs text-muted-foreground mt-6">
                {t(locale, "auth.expires_in")}{" "}
                <span className="font-semibold" style={{ color: "#FF4C52" }}>{mmss}</span>
              </div>

              {challenge?.dev_code && (
                <div data-testid={AUTH.devCodeHint} className="mt-4 text-center text-[11px] text-muted-foreground bg-secondary/50 rounded-lg py-2 px-3">
                  Development mode — OTP: <span className="font-mono font-semibold text-foreground">{challenge.dev_code}</span>
                </div>
              )}

              <Button
                data-testid={AUTH.verifyBtn}
                onClick={verifyOtp}
                disabled={busy || otp.join("").length !== OTP_LEN}
                className="w-full mt-6 h-14 text-base font-semibold baked-btn"
                style={{ backgroundColor: "#FF4C52", color: "white" }}
              >
                {t(locale, "auth.verify_continue")}
              </Button>

              <div className="flex justify-center gap-8 mt-4">
                <button data-testid={AUTH.resendBtn} onClick={requestOtp} className="text-xs text-muted-foreground hover:text-foreground motion-fast">
                  ↻ {t(locale, "auth.resend")}
                </button>
                <button data-testid={AUTH.changeNumberBtn + "-2"} onClick={() => setStep("phone")} className="text-xs text-muted-foreground hover:text-foreground motion-fast">
                  ✎ {t(locale, "auth.change_number")}
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
