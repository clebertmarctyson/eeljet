import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import {
  Globe,
  GitBranch,
  Settings2,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  Github,
} from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Instant Subdomains",
    description:
      "Pick a name, get yourapp.eeljet.com live with HTTPS. No configuration needed.",
  },
  {
    icon: GitBranch,
    title: "GitHub Integration",
    description:
      "Deploy from any repo and branch. Auto-deploy on push to keep your app always up-to-date.",
  },
  {
    icon: Settings2,
    title: "Zero Config",
    description:
      "Auto-detected package manager, build commands, and process management. Override anything if needed.",
  },
  {
    icon: KeyRound,
    title: "Environment Variables",
    description:
      "Encrypted env vars injected at build time. Paste your .env or add one by one.",
  },
  {
    icon: RotateCcw,
    title: "One-Click Redeploy",
    description:
      "Restart, redeploy, or roll back from the dashboard. Full deployment history included.",
  },
  {
    icon: ShieldCheck,
    title: "Automatic HTTPS",
    description:
      "Every deployment includes free SSL certificate. Your app is secure by default.",
  },
];

const deploySteps = [
  {
    step: "01",
    label: "Connect",
    desc: "Sign in with GitHub and pick a repository",
  },
  {
    step: "02",
    label: "Configure",
    desc: "Choose a subdomain and add your environment variables",
  },
  {
    step: "03",
    label: "Deploy",
    desc: "One click. Build, start, and go live automatically",
  },
  {
    step: "04",
    label: "Manage",
    desc: "View logs, redeploy, or update from your dashboard",
  },
];

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/50 bg-background/60 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/eeljet.png"
              alt="EelJet"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-lg font-bold tracking-tight">EelJet</span>
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/clebertmarctyson/eeljet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-4 w-4" />
            </a>
            <ThemeToggle />
            {session ? (
              <Link href="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            ) : (
              <Link href="/api/auth/signin">
                <Button size="sm">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.627_0.194_149/8%)_0%,transparent_70%)]" />

        <div className="relative container mx-auto px-4 py-24 md:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Deploy at jet speed
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                Deploy your app.
                <br />
                <span className="text-primary">Get a subdomain.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-md">
                Connect your GitHub repo, pick a subdomain, and your app is live
                at yourapp.eeljet.com with HTTPS.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href={session ? "/dashboard" : "/api/auth/signin"}>
                  <Button size="lg" className="gap-2">
                    {session ? "Open Dashboard" : "Get Started"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a
                  href="https://github.com/clebertmarctyson/eeljet"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="lg" variant="outline" className="gap-2">
                    <Github className="h-4 w-4" />
                    Source Code
                  </Button>
                </a>
              </div>
            </div>

            {/* Right: Terminal mock */}
            <div className="relative">
              <div className="glow-green rounded-xl">
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-2xl">
                  {/* Title bar */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-500/70" />
                      <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                      <div className="h-3 w-3 rounded-full bg-green-500/70" />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono ml-2">
                      terminal
                    </span>
                  </div>
                  {/* Body */}
                  <div className="p-4 font-mono text-sm space-y-2 bg-background">
                    <div className="flex gap-2">
                      <span className="text-primary">$</span>
                      <span className="text-foreground">
                        eeljet deploy my-app
                      </span>
                    </div>
                    <div className="text-muted-foreground space-y-1 text-xs">
                      <p>
                        <span className="text-primary">&#10003;</span>{" "}
                        Repository cloned{" "}
                        <span className="text-muted-foreground/60">
                          main@3f2a1b9
                        </span>
                      </p>
                      <p>
                        <span className="text-primary">&#10003;</span>{" "}
                        Dependencies installed{" "}
                        <span className="text-muted-foreground/60">pnpm</span>
                      </p>
                      <p>
                        <span className="text-primary">&#10003;</span> Build
                        complete{" "}
                        <span className="text-muted-foreground/60">12.3s</span>
                      </p>
                      <p>
                        <span className="text-primary">&#10003;</span>{" "}
                        Application started{" "}
                        <span className="text-muted-foreground/60">
                          online
                        </span>
                      </p>
                      <p>
                        <span className="text-primary">&#10003;</span> SSL
                        certificate issued
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border/30">
                      <p className="text-primary font-medium text-xs">
                        &#10003; Live at https://my-app.eeljet.com
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">$</span>
                      <span className="inline-block w-2 h-4 bg-primary animate-blink" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              Everything you need to ship
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              From repo to live URL, EelJet handles the entire deployment
              pipeline for you.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-lg border border-border/50 bg-card/50 p-6 hover:border-primary/30 hover:bg-card transition-colors"
              >
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold mb-1.5">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deploy Flow */}
      <section className="py-20 border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              From repo to live in four steps
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              One form. Your app is live in under a minute.
            </p>
          </div>
          <div className="max-w-2xl mx-auto space-y-3">
            {deploySteps.map((item) => (
              <div
                key={item.step}
                className="flex items-start gap-4 rounded-lg border border-border/50 bg-card/30 p-4 hover:border-primary/20 transition-colors"
              >
                <span className="text-xs font-mono text-primary font-bold mt-0.5">
                  {item.step}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm">{item.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Image
              src="/eeljet.png"
              alt="EelJet"
              width={20}
              height={20}
              className="rounded"
            />
            <span>EelJet</span>
            <span className="text-border">|</span>
            <span>by Marc Tyson Clebert</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a
              href="https://github.com/clebertmarctyson"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://marctysonclebert.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Portfolio
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
