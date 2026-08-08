import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { DropMark, Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Lock, Mail, MailCheck, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

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

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const {
    isLoading: authLoading,
    isAuthenticated,
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    translateError,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Password-reset callback from Supabase.
  //   * web: email link → /auth#access_token=…&type=recovery
  //   * native: deep link handler exchanged the token then navigated to /auth?mode=reset
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || searchParams.get("mode") === "reset") {
      setMode("reset");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn({ email, password });
      navigate(redirect);
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { requiresEmailConfirmation } = await signUp({ email, password, name: name || undefined });
      if (requiresEmailConfirmation) {
        // Email confirmation is enabled — never navigate into a session that
        // doesn't exist yet. Show a clear "check your email" state instead.
        setMode("confirm");
      } else {
        navigate(redirect);
      }
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const handleForgot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    setIsLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      setMode("signIn");
      setPassword("");
      setError(null);
    } catch (err) {
      setError(translateError(err));
      setIsLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(false);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-primary/12 blur-[110px]" />
      </div>

      <button
        type="button"
        onClick={() => navigate("/")}
        className="relative mb-8 cursor-pointer"
        aria-label="Back to home"
      >
        <Logo />
      </button>

      <Card className="relative w-full max-w-sm rounded-3xl border border-border/80 bg-card/90 shadow-none backdrop-blur-xl">
        {mode === "signIn" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12">
                <DropMark className="h-7 w-7" />
              </div>
              <CardTitle className="mt-4 text-2xl font-extrabold tracking-tight">
                Welcome back to your memory.
              </CardTitle>
              <CardDescription className="mx-auto max-w-xs text-sm">
                Sign in to find everything you've dropped — screenshots, links,
                products and places.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSignIn}>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    className="h-11 rounded-xl pl-10"
                    disabled={isLoading}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    type="password"
                    className="h-11 rounded-xl pl-10"
                    disabled={isLoading}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => switchMode("forgot")}
                  >
                    Forgot password?
                  </Button>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  className="h-11 w-full gap-2 rounded-xl font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Sign in <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </form>
            <CardFooter className="flex-col gap-2 pb-6">
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">New to DROP?</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2 rounded-xl"
                onClick={() => switchMode("signUp")}
                disabled={isLoading}
              >
                <UserX className="h-4 w-4" />
                Create an account
              </Button>
            </CardFooter>
          </>
        )}

        {mode === "signUp" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-xl font-extrabold tracking-tight">
                Create your account
              </CardTitle>
              <CardDescription>
                Save anything. DROP figures out the rest.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSignUp}>
              <CardContent className="space-y-4">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  className="h-11 rounded-xl"
                  disabled={isLoading}
                  autoComplete="name"
                />
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    className="h-11 rounded-xl pl-10"
                    disabled={isLoading}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 characters)"
                    type="password"
                    minLength={6}
                    className="h-11 rounded-xl pl-10"
                    disabled={isLoading}
                    required
                    autoComplete="new-password"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  className="h-11 w-full gap-2 rounded-xl font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Create account <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </form>
            <CardFooter className="pb-6">
              <Button
                type="button"
                variant="link"
                className="mx-auto h-auto p-0 text-xs"
                onClick={() => switchMode("signIn")}
              >
                Already have an account? Sign in
              </Button>
            </CardFooter>
          </>
        )}

        {mode === "forgot" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-xl font-extrabold tracking-tight">
                Reset your password
              </CardTitle>
              <CardDescription>
                {sent
                  ? "Check your inbox — we've sent you a reset link."
                  : "Enter your email and we'll send you a reset link."}
              </CardDescription>
            </CardHeader>
            {!sent ? (
              <form onSubmit={handleForgot}>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      type="email"
                      className="h-11 rounded-xl pl-10"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <Button
                    type="submit"
                    className="h-11 w-full gap-2 rounded-xl font-semibold"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Send reset link <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </form>
            ) : (
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={() => switchMode("signIn")}
                >
                  Back to sign in
                </Button>
              </CardContent>
            )}
            <CardFooter className="pb-6">
              <Button
                type="button"
                variant="link"
                className="mx-auto h-auto p-0 text-xs"
                onClick={() => switchMode("signIn")}
              >
                Remembered it? Sign in
              </Button>
            </CardFooter>
          </>
        )}

        {mode === "confirm" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12">
                <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
              </div>
              <CardTitle className="mt-4 text-xl font-extrabold tracking-tight">
                Check your email to continue
              </CardTitle>
              <CardDescription className="mx-auto max-w-xs">
                We've sent a confirmation link to <span className="font-semibold">{email}</span>.
                Tap it to activate your account, then sign in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="button"
                className="h-11 w-full gap-2 rounded-xl font-semibold"
                onClick={() => {
                  setMode("signIn");
                  setEmail("");
                }}
              >
                Sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </>
        )}

        {mode === "reset" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-xl font-extrabold tracking-tight">
                Choose a new password
              </CardTitle>
            </CardHeader>
            <form onSubmit={handleReset}>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password (min 6 characters)"
                    type="password"
                    minLength={6}
                    className="h-11 rounded-xl pl-10"
                    disabled={isLoading}
                    required
                    autoComplete="new-password"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  className="h-11 w-full gap-2 rounded-xl font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Update password <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </form>
          </>
        )}
      </Card>

      <p className="relative mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> Private by default. Nothing you save is ever public.
      </p>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
