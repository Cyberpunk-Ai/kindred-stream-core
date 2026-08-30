import { Link } from "@/lib/router-compat";
import {
  Trophy,
  Twitter,
  Instagram,
  Youtube,
  MessageCircle,
  Mail,
  Phone,
} from "lucide-react";
import { useState } from "react";
import { usePWA } from "@/lib/pwa";
import { InstallModal } from "@/components/pwa/install-modal";

const footerLinks = {
  platform: [
    { name: "Tournaments", href: "/tournaments" },
    { name: "Leaderboard", href: "/leaderboard" },
    { name: "Marketplace", href: "/marketplace" },
    { name: "How It Works", href: "/how-it-works" },
  ],
  support: [
    { name: "Help Center", href: "/support" },
    { name: "Contact Us", href: "/contact" },
    { name: "FAQs", href: "/faqs" },
    { name: "Report Issue", href: "/report" },
  ],
  legal: [
    { name: "Terms of Service", href: "/terms" },
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Refund Policy", href: "/refund" },
    { name: "Fair Play", href: "/fair-play" },
  ],
};

const socialLinks = [
  {
    name: "X",
    icon: Twitter,
    href: "https://x.com/itsgameflex",
  },
  {
    name: "Instagram",
    icon: Instagram,
    href: "https://www.instagram.com/itsgameflex/",
  },
  {
    name: "YouTube",
    icon: Youtube,
    href: "https://www.youtube.com/@itsgameflex",
  },
  {
    name: "WhatsApp",
    icon: MessageCircle,
    href: "https://wa.me/254704208394",
  },
];

export function Footer() {
  const {
    promptInstall,
    isInstalled,
    isIos,
    hasInstallPrompt,
  } = usePWA();

  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (!hasInstallPrompt && !(window as any).__GAMEFLEX_DEFERRED_PROMPT) {
      setShowInstallHelp(true);
      return;
    }

    if (promptInstall) {
      await promptInstall();
      return;
    }

    setShowInstallModal(true);
  };

  return (
    <footer className="bg-card border-t border-border/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/30">
                <Trophy className="h-6 w-6 text-primary-foreground" />
              </div>

              <span className="font-display text-xl font-bold tracking-tight">
                Game<span className="text-primary">Flex</span>
              </span>
            </Link>

            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              The world's premier gaming ecosystem. Discover the complete gaming
              experience on one platform.
            </p>

            <div className="flex items-center gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;

                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`GameFlex on ${social.name}`}
                    title={`GameFlex on ${social.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}

              {!isInstalled && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="ml-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Install GameFlex
                </button>
              )}
            </div>
          </div>

          {/* Platform Links */}
          <div>
            <h3 className="mb-4 font-display font-semibold">Platform</h3>

            <ul className="space-y-3">
              {footerLinks.platform.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="mb-4 font-display font-semibold">Support</h3>

            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="mb-4 font-display font-semibold">Legal</h3>

            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* iOS guide modal */}
        {showIosGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="max-w-sm rounded-xl bg-card p-6">
              <h3 className="mb-2 font-semibold">
                Add GameFlex to your Home Screen
              </h3>

              <p className="mb-4 text-sm text-muted-foreground">
                Tap the share button in Safari, then choose "Add to Home Screen"
                to install GameFlex.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowIosGuide(false)}
                  className="rounded bg-secondary/50 px-3 py-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Install help modal */}
        {showInstallHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="max-w-sm rounded-xl bg-card p-6">
              <h3 className="mb-2 font-semibold">Install GameFlex</h3>

              <p className="mb-4 text-sm text-muted-foreground">
                To install GameFlex on desktop or Android, open your browser
                menu and choose "Install", or use the install icon in the
                address bar. On Chrome desktop, use the three-dot menu and
                choose "Install GameFlex".
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInstallHelp(false)}
                  className="rounded bg-secondary/50 px-3 py-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Branded install modal */}
        {showInstallModal && (
          <InstallModal
            open={showInstallModal}
            onOpenChange={setShowInstallModal}
          />
        )}

        {/* Contact Info */}
        <div className="mt-12 border-t border-border/50 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <a
                href="mailto:support@gameflex.co.ke"
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <Mail className="h-4 w-4" />
                support@gameflex.co.ke
              </a>

              <a
                href="tel:+254704208394"
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <Phone className="h-4 w-4" />
                +254 704 208 394
              </a>
            </div>

            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} GameFlex. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}