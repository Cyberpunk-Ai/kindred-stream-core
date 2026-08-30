import { useState, useRef } from "react";
import { Phone, Copy, AlertCircle, Loader2, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { backend } from "@/backend";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { getStorageUrl } from "@/lib/storage-url";

interface PaymentModalProps {
  tournament: {
    id: string;
    title: string;
    entryFee: number;
    groupLink?: string | null;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MPESA_PHONE = "0704208394";

export function PaymentModal({ tournament, isOpen, onClose, onSuccess }: PaymentModalProps) {
  const [step, setStep] = useState<"instructions" | "verify">("instructions");
  const [transactionCode, setTransactionCode] = useState("");
  const [gameHandle, setGameHandle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image",
        variant: "destructive",
      });
      return;
    }
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!transactionCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter the M-Pesa transaction code",
        variant: "destructive",
      });
      return;
    }

    if (!gameHandle.trim()) {
      toast({
        title: "Error",
        description: "Please enter your game handle/username",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Error",
        description: "Please log in to register",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current authenticated session user
      const {
        data: { session },
      } = await backend.auth.getSession();
      const activeUser = session?.user || user;

      if (!activeUser) {
        throw new Error("No active user session found. Please log in again.");
      }

      let screenshotUrl = null;

      // Upload screenshot if provided
      if (screenshotFile) {
        try {
          const fileExt = screenshotFile.name.split(".").pop();
          const filePath = `${activeUser.id}/${tournament.id}/${Date.now()}.${fileExt}`;
          const { error: uploadError } = await backend.storage
            .from("support")
            .upload(filePath, screenshotFile);
          if (!uploadError) {
            screenshotUrl = await getStorageUrl("support", filePath);
          }
        } catch (e) {
          console.warn("Screenshot upload warning:", e);
        }
      }

      // 1. Create payment record
      const { data: payment, error: paymentError } = await backend
        .from("payments")
        .insert({
          user_id: activeUser.id,
          tournament_id: tournament.id,
          amount: tournament.entryFee,
          method: "mpesa",
          transaction_code: transactionCode.trim().toUpperCase(),
          screenshot_url: screenshotUrl,
          status: "pending" as const,
        })
        .select()
        .single();

      if (paymentError || !payment) throw paymentError ?? new Error("Payment could not be saved");
      const paymentId = payment.id;

      // 2. Create registration record
      const { error: regError } = await backend.from("registrations").insert({
        user_id: activeUser.id,
        tournament_id: tournament.id,
        game_handle: gameHandle.trim(),
        payment_id: paymentId,
        status: "pending" as const,
      });

      if (regError) throw regError;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["user-registration"] });
      queryClient.invalidateQueries({ queryKey: ["user-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["registrations"] });
      queryClient.invalidateQueries({ queryKey: ["tournament"] });

      toast({
        title: "Registration Submitted!",
        description: "Your payment is being verified. You will be notified once confirmed.",
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep("instructions");
    setTransactionCode("");
    setGameHandle(profile?.game_handle || "");
    removeScreenshot();
    onClose();
  };

  // Pre-fill game handle from profile
  useState(() => {
    if (profile?.game_handle) {
      setGameHandle(profile.game_handle);
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {step === "instructions" ? "Pay via M-Pesa" : "Verify Payment"}
          </DialogTitle>
          <DialogDescription>
            {step === "instructions"
              ? `Entry fee: KES ${tournament.entryFee.toLocaleString()}`
              : "Enter your M-Pesa transaction details"}
          </DialogDescription>
        </DialogHeader>

        {step === "instructions" ? (
          <div className="space-y-6">
            {/* Payment Instructions */}
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  M-Pesa Send Money Instructions
                </h4>
                <ol className="space-y-2 text-sm">
                  <li>1. Go to M-Pesa on your phone</li>
                  <li>
                    2. Select <strong>Send Money</strong>
                  </li>
                  <li>
                    3. Enter Phone Number: <strong>{MPESA_PHONE}</strong>
                  </li>
                  <li>
                    4. Enter Amount: <strong>KES {tournament.entryFee}</strong>
                  </li>
                  <li>5. Enter your M-Pesa PIN and confirm</li>
                </ol>
              </div>

              {/* Quick Copy */}
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => copyToClipboard(MPESA_PHONE, "Phone Number")}
                  className="p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-left"
                >
                  <span className="text-xs text-muted-foreground">Phone Number</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold">{MPESA_PHONE}</span>
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  After payment, save your M-Pesa confirmation message. You'll need the transaction
                  code to verify.
                </p>
              </div>
            </div>

            <Button onClick={() => setStep("verify")} className="w-full">
              I've Made the Payment
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transactionCode">M-Pesa Transaction Code</Label>
              <Input
                id="transactionCode"
                placeholder="e.g., QWE12345RT"
                value={transactionCode}
                onChange={(e) => setTransactionCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Find this in your M-Pesa confirmation SMS
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gameHandle">Your Game Handle/Username</Label>
              <Input
                id="gameHandle"
                placeholder="e.g., ProGamer#1234"
                value={gameHandle}
                onChange={(e) => setGameHandle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This is how opponents will find you in-game
              </p>
            </div>

            <div className="space-y-2">
              <Label>Payment Screenshot (Optional)</Label>
              {screenshotPreview ? (
                <div className="relative">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={screenshotPreview}
                    alt="Screenshot"
                    className="w-full rounded-lg border max-h-40 object-cover"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={removeScreenshot}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50"
                >
                  <Camera className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Upload M-Pesa screenshot</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("instructions")} className="flex-1">
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
