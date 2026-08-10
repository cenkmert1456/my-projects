import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { haptic } from "@/lib/mobile/native";
import { cn } from "@/lib/utils";
import { DropMark } from "@/components/Logo";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { BootScreen } from "@/components/app/BootScreen";
import { ConfigErrorScreen } from "@/components/app/ConfigErrorScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  User,
} from "lucide-react";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/app") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type Mode = "signIn" | "signUp" | "forgot" | "reset" | "confirm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(email: string): string {
  const [local = "", domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 2);
  const dots = "•".repeat(Math.min(6, Math.max(3, local.length - 2)));
  return `${head}${dots}@${domain}`;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { t } = useTranslation();
  const {
    startupState,
    isLoading: authLoading,
    isAuthenticated,
    signIn,
    signUp,
    signInWithGoogle,
    resetPassword,
    resendConfirmation,
    updatePassword,
    translateError,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; name?: string }>({});
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);

  // Password-reset callback from Supabase.
  //   * web: email link → /auth?mode=reset&code=…
  //   * native: deep link handler exchanged the token then navigated to /auth?mode=reset
  //   * implicit fallback: /auth#access_token=…&type=recovery
  useEffect(() => {
    const hash = window.location.hash;
    if (
      hash.includes("type=recovery") ||
      searchParams.get("mode") === "reset" ||
      searchParams.get("type") === "recovery"
    ) {
      setMode("reset");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams]);

  // Once the session is known to exist, leave the auth screen (unless the
  // user is mid password-reset, which needs the session to stay here).
  useEffect(() => {
    if (authLoading) return;
    if (mode === "reset") return;
    if (isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect, mode]);

  // Startup gate: never flash the form before the session is known.
  if (startupState === "BOOTING") return <BootScreen />;
  if (startupState === "FATAL_CONFIGURATION_ERROR") return <ConfigErrorScreen />;

  const clearFieldError = (key: keyof typeof fieldErrors) =>
    setFieldErrors((f) => ({ ...f, [key]: undefined }));

  const validate = (): boolean => {
    const next: { email?: string; password?: string; name?: string } = {};
    if (mode !== "forgot") {
      if (!EMAIL_RE.test(email.trim())) next.email = t("auth.emailValidation");
      if (!password || password.length < 6) next.password = t("auth.passwordMinError");
      if (mode === "signUp" && password !== passwordConfirm) next.password = t("auth.passwordMismatch");
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    if (!validate()) return;
    setIsLoading(true);
    setError(null);
    haptic("light");
    try {
      await signIn({ email, password });
      // navigate(redirect) happens via the effect once the session lands
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    if (!validate()) return;
    setIsLoading(true);
    setError(null);
    haptic("light");
    try {
      const { requiresEmailConfirmation } = await signUp({ email, password, name: name.trim() || undefined });
      if (requiresEmailConfirmation) {
        setMode("confirm");
      }
      // otherwise the session effect navigates to Home
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const handleForgot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    if (!EMAIL_RE.test(email.trim())) {
      setFieldErrors({ email: t("auth.emailValidation") });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
      setIsLoading(false);
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    if (password.length < 6) {
      setFieldErrors({ password: t("auth.passwordMinError") });
      return;
    }
    if (password !== passwordConfirm) {
      setFieldErrors({ password: t("auth.passwordMismatch") });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      haptic("success");
      navigate("/app", { replace: true });
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    haptic("light");
    try {
      await signInWithGoogle();
      // Native: returns once the custom tab opens — release the button so the
      // user can retry after returning from Google. Web: page redirects away.
      setIsLoading(false);
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      await resendConfirmation(email);
      setResent(true);
      haptic("success");
      setIsLoading(false);
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(false);
    setResent(false);
    setFieldErrors({});
  };

  const field = "h-12 rounded-2xl border-border/80 bg-card pl-11 text-[15px]";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-primary/12 blur-[120px]" />
        <div className="absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-blue-500/8 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex cursor-pointer items-center gap-2.5 animate-drop-fade-up"
          aria-label="DROP home"
        >
          <DropMark className="h-9 w-9" />
          <span className="text-lg font-extrabold tracking-[0.06em] text-foreground">DROP</span>
        </button>
        {mode !== "signIn" && (
          <button
            type="button"
            onClick={() => switchMode("signIn")}
            className="cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("common.back")}
          </button>
        )}
      </header>

      {/* Content */}
      <main className="relative flex flex-1 flex-col justify-center px-6 pb-8">
        <div key={mode} className="animate-drop-fade-up">
          {/* Headline */}
          {mode !== "reset" && mode !== "confirm" && (
            <div className="mb-8">
              <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight text-foreground">
                {t("auth.rememberEverything")}
              </h1>
              <p className="mt-2 text-[15px] text-muted-foreground">
                {t("auth.tagline")}
              </p>
            </div>
          )}

          {/* Google */}
          {(mode === "signIn" || mode === "signUp") && (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={isLoading}
                className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-3 rounded-2xl border border-border bg-white text-[15px] font-semibold text-neutral-800 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
                ) : (
                  <GoogleIcon className="h-5 w-5" />
                )}
                {t("auth.continueWithGoogle")}
              </button>

              <div className="my-6 flex items-center gap-4" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("auth.or")}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {/* Sign in / Sign up */}
          {(mode === "signIn" || mode === "signUp") && (
            <form onSubmit={mode === "signIn" ? handleSignIn : handleSignUp} noValidate className="space-y-3.5">
              {mode === "signUp" && (
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearFieldError("name");
                    }}
                    placeholder={t("auth.yourName")}
                    className={field}
                    disabled={isLoading}
                    autoComplete="name"
                    autoCapitalize="words"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  placeholder="name@example.com"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={cn(field, fieldErrors.email && "border-red-500/60")}
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.email && <FieldError message={fieldErrors.email} />}
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                  placeholder={mode === "signUp" ? t("auth.passwordMin") : t("auth.password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                  className={cn(field, "pr-12", fieldErrors.password && "border-red-500/60")}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {mode === "signUp" && (
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={passwordConfirm}
                    onChange={(e) => {
                      setPasswordConfirm(e.target.value);
                      clearFieldError("password");
                    }}
                    placeholder={t("auth.confirmPassword")}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={cn(field, "pr-12", fieldErrors.password && "border-red-500/60")}
                    disabled={isLoading}
                  />
                </div>
              )}
              {fieldErrors.password && <FieldError message={fieldErrors.password} />}

              {mode === "signIn" && (
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("auth.forgotPassword")}
                  </button>
                </div>
              )}

              {error && <InlineError message={error} />}

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-1 h-[52px] w-full gap-2 rounded-2xl text-[15px] font-semibold shadow-none"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {mode === "signIn" ? t("auth.signIn") : t("auth.createAccount")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Forgot password */}
          {mode === "forgot" && (
            <>
              {!sent ? (
                <form onSubmit={handleForgot} noValidate className="space-y-3.5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("auth.forgotIntro")}
                  </p>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError("email");
                      }}
                      placeholder="name@example.com"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className={cn(field, fieldErrors.email && "border-red-500/60")}
                      disabled={isLoading}
                    />
                  </div>
                  {fieldErrors.email && <FieldError message={fieldErrors.email} />}
                  {error && <InlineError message={error} />}
                  <Button type="submit" disabled={isLoading} className="mt-1 h-[52px] w-full gap-2 rounded-2xl text-[15px] font-semibold shadow-none">
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{t("auth.backToSignIn")} <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card/60 px-6 py-10 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12">
                    <MailCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-300" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">{t("auth.checkInbox")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("auth.resetSent")} <span className="font-semibold text-foreground">{maskEmail(email)}</span>.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full rounded-2xl" onClick={() => switchMode("signIn")}>
                    {t("auth.backToSignIn")}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Check your email (signup confirmation) */}
          {mode === "confirm" && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/12">
                <MailCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">{t("auth.checkInbox")}</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {t("auth.confirmSent")}{" "}
                  <span className="font-semibold text-foreground">{maskEmail(email)}</span>.
                  {t("auth.tapToActivate")}
                </p>
              </div>
              {resent && (
                <p className="flex items-center gap-1.5 rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> {t("auth.emailResent")}
                </p>
              )}
              {error && <InlineError message={error} />}
              <div className="w-full space-y-2.5">
                <Button
                  type="button"
                  className="h-[52px] w-full rounded-2xl text-[15px] font-semibold shadow-none"
                  onClick={() => {
                    window.location.href = "mailto:";
                  }}
                >
                  {t("auth.openEmailApp")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-[52px] w-full gap-2 rounded-2xl text-[15px]"
                  onClick={handleResend}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("auth.resend")}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    switchMode("signUp");
                    setEmail("");
                    setPassword("");
                    setPasswordConfirm("");
                  }}
                  className="w-full cursor-pointer pt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("auth.useDifferentEmail")}
                </button>
              </div>
            </div>
          )}

          {/* New password (recovery) */}
          {mode === "reset" && (
            <form onSubmit={handleReset} noValidate className="space-y-3.5">
              <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{t("auth.chooseNewPassword")}</h1>
              <p className="text-sm text-muted-foreground">{t("auth.newPasswordHint")}</p>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                  placeholder={t("auth.newPassword")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className={cn(field, "pr-12", fieldErrors.password && "border-red-500/60")}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={passwordConfirm}
                  onChange={(e) => {
                    setPasswordConfirm(e.target.value);
                    clearFieldError("password");
                  }}
                  placeholder={t("auth.confirmNewPassword")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className={cn(field, "pr-12", fieldErrors.password && "border-red-500/60")}
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.password && <FieldError message={fieldErrors.password} />}
              {error && <InlineError message={error} />}
              <Button type="submit" disabled={isLoading} className="mt-1 h-[52px] w-full gap-2 rounded-2xl text-[15px] font-semibold shadow-none">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{t("auth.updatePassword")} <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative flex flex-col items-center gap-3 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {(mode === "signIn" || mode === "signUp") && (
          <button
            type="button"
            onClick={() => switchMode(mode === "signIn" ? "signUp" : "signIn")}
            className="cursor-pointer text-sm font-semibold text-foreground"
          >
            {mode === "signIn" ? (
              <>
                {t("auth.newToDrop")}{" "}
                <span className="font-bold text-primary">{t("auth.createAccount")}</span>
              </>
            ) : (
              <>
                {t("auth.haveAccount")}{" "}
                <span className="font-bold text-primary">{t("auth.signIn")}</span>
              </>
            )}
          </button>
        )}
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground/80">
          {t("auth.terms")}
          <br />
          {t("auth.privateDefault")}
        </p>
      </footer>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="-mt-1.5 pl-1 text-[13px] font-medium text-red-500">{message}</p>;
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium leading-snug text-red-600 dark:text-red-300">
      {message}
    </p>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
