import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "@/lib/router-compat";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Phone, Lock, User, Mail, Gamepad2, Trophy, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { GoogleAuthButton, AuthDivider } from "@/components/auth/GoogleAuthButton";

const registerSchema = z
  .object({
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    gameHandle: z.string().optional(),
    referralCode: z.string().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, resendVerification } = useAuth();
  const { toast } = useToast();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      phone: "",
      username: "",
      email: "",
      gameHandle: "",
      referralCode: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const ref =
      new URLSearchParams(location.search).get("ref")?.trim() ||
      localStorage.getItem("gameflex_referral_code") ||
      "";
    if (ref) {
      localStorage.setItem("gameflex_referral_code", ref);
      form.setValue("referralCode", ref);
    }
  }, [location.search, form]);

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      if (data.referralCode?.trim()) {
        localStorage.setItem("gameflex_referral_code", data.referralCode.trim());
      }
      const email = data.email.trim().toLowerCase();
      const { error, needsEmailConfirmation } = await register(
        email,
        data.password,
        data.username,
        data.referralCode?.trim(),
        { phone: data.phone.trim(), gameHandle: data.gameHandle?.trim() },
      );
      if (error) throw error;

      if (needsEmailConfirmation) {
        setPendingEmail(email);
        toast({
          title: "Check your email",
          description: `We sent a verification link to ${email}.`,
        });
        return;
      }

      toast({ title: "Welcome to GameFlex!", description: "Your account has been created" });
      navigate("/");
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onResend = async () => {
    if (!pendingEmail) return;
    setIsResending(true);
    const { error } = await resendVerification(pendingEmail);
    setIsResending(false);
    toast({
      title: error ? "Could not resend" : "Verification email sent",
      description: error ? error.message : `Check ${pendingEmail} for the link.`,
      variant: error ? "destructive" : undefined,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/30">
              <Trophy className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold">
              Game<span className="text-primary">Flex</span>
            </span>
          </Link>
          <h1 className="font-display text-3xl font-bold">Join GameFlex</h1>
          <p className="text-muted-foreground mt-2">Create your account and start competing</p>
        </div>
        {pendingEmail ? (
          <Card className="border-border/50">
            <CardContent className="p-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h2 className="font-display text-xl font-bold">Verify your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a verification link to{" "}
                <span className="font-medium text-foreground">{pendingEmail}</span>. Click it to
                activate your account, then sign in.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isResending}
                onClick={onResend}
              >
                {isResending ? "Sending…" : "Resend verification email"}
              </Button>
              <Button asChild variant="neon" className="w-full">
                <Link to="/login">Go to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50">
            <CardContent className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              name="phone"
                              autoComplete="tel"
                              placeholder="0712345678"
                              className="pl-10"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              name="email"
                              autoComplete="email"
                              placeholder="you@example.com"
                              className="pl-10"
                              type="email"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              name="username"
                              autoComplete="username"
                              placeholder="ProGamer254"
                              className="pl-10"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gameHandle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Game Handle</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Gamepad2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              name="gameHandle"
                              placeholder="YourTag#1234"
                              className="pl-10"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="referralCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Referral Code (Optional)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              name="referralCode"
                              placeholder="Enter referral code"
                              className="pl-10 uppercase font-mono"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              name="password"
                              autoComplete="new-password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              className="pl-10 pr-10"
                            />
                            <button
                              type="button"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                              aria-pressed={showPassword}
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            name="confirmPassword"
                            autoComplete="new-password"
                            type="password"
                            placeholder="••••••••"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" variant="neon" disabled={isLoading}>
                    {isLoading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </Form>
              <AuthDivider text="or" />
              <GoogleAuthButton label="Sign up with Google" />
              <p className="text-center text-sm text-muted-foreground mt-6">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
