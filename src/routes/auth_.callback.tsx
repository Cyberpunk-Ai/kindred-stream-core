import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backend } from "@/backend";
import { pageSeo } from "@/lib/seo";

export const Route = createFileRoute("/auth_/callback")({
  ssr: false,
  head: () =>
    pageSeo({
      title: "Signing you in | GameFlex",
      description: "Completing your GameFlex sign-in.",
      noindex: true,
    }),
  component: AuthCallback,
});

function readError() {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    query.get("error_description") ||
    query.get("error") ||
    hash.get("error_description") ||
    hash.get("error") ||
    null
  );
}

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const providerError = readError();
    if (providerError) {
      setError(providerError);
      return;
    }

    const finish = () => {
      if (cancelled) return;
      const target = sessionStorage.getItem("gameflex_post_auth_redirect");
      sessionStorage.removeItem("gameflex_post_auth_redirect");
      navigate({
        to: target && target.startsWith("/") ? target : "/",
        replace: true,
      });
    };

    // backend-js parses the tokens out of the URL asynchronously, so wait for
    // either the resulting session or the auth event before navigating.
    const {
      data: { subscription },
    } = backend.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    let checkAttempts = 0;

    const checkSession = async () => {
      const { data } = await backend.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        finish();
        return;
      }

      checkAttempts += 1;
      if (checkAttempts >= 2) {
        setError("This sign-in link is invalid or has already been used.");
        return;
      }

      // No session and no provider error: the link was already used or expired.
      setTimeout(() => {
        if (cancelled) return;
        void checkSession();
      }, 2500);
    };

    void checkSession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
          <Trophy className="h-6 w-6 text-primary-foreground" />
        </div>
        {error ? (
          <>
            <h1 className="font-display text-2xl font-bold">Sign-in link problem</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="neon" className="w-full" onClick={() => navigate({ to: "/login" })}>
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold">Signing you in…</h1>
            <p className="text-sm text-muted-foreground">Verifying your account, one moment.</p>
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          </>
        )}
      </div>
    </div>
  );
}
