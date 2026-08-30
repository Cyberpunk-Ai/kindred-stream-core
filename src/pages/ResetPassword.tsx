import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Lock, Trophy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { backend } from "@/backend";

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // "checking" while backend-js parses the recovery token out of the URL.
  const [linkState, setLinkState] = useState<"checking" | "valid" | "invalid">("checking");

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = backend.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setLinkState("valid");
    });

    let validationAttempts = 0;

    const validateSession = async () => {
      const { data } = await backend.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setLinkState("valid");
        return;
      }

      validationAttempts += 1;
      if (validationAttempts >= 2) {
        setLinkState("invalid");
        return;
      }

      // Token parsing is async; give it a moment before declaring the link dead.
      setTimeout(() => {
        if (cancelled) return;
        void validateSession();
      }, 2000);
    };

    void validateSession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await backend.auth.updateUser({ password });
      if (error) throw error;
      toast({
        title: "Password updated",
        description: "You can now sign in with your new password.",
      });
      navigate("/login");
    } catch (err) {
      toast({
        title: "Could not update password",
        description: err instanceof Error ? err.message : "The reset link may have expired.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
              <Trophy className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold">
              Game<span className="text-primary">Flex</span>
            </span>
          </Link>
          <h1 className="font-display text-3xl font-bold">Set a new password</h1>
          <p className="text-muted-foreground mt-2">Choose something you'll remember.</p>
        </div>
        <Card className="border-border/50">
          <CardContent className="p-6">
            {linkState === "checking" && (
              <p className="text-center text-sm text-muted-foreground">Verifying your link…</p>
            )}
            {linkState === "invalid" && (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  This reset link is invalid or has expired. Request a new one to continue.
                </p>
                <Button asChild variant="neon" className="w-full">
                  <Link to="/forgot-password">Request a new link</Link>
                </Button>
              </div>
            )}
            {linkState === "valid" && (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm"
                      type={show ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" variant="neon" disabled={isLoading}>
                  {isLoading ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
