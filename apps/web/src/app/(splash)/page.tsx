import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@packages/ui/components/button";
import { Card, CardContent } from "@packages/ui/components/card";
import {
  ArrowRight,
  Github,
  Check,
  Heart,
  Zap,
  Shield,
  Code,
  Users,
  Cpu,
  Rocket,
  ChevronRight,
  Terminal,
  Bot,
  MessageSquare,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@packages/ui/components/accordion";

/**
 * Landing page for OpenClaw Mission Control
 * Open Source AI Agent Coordination Platform - Building in Public
 */
export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Terminal className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">
              OpenClaw
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#the-experiment"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              The Experiment
            </a>
            <a
              href="#open-source"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Open Source
            </a>
            <a
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#faq"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex text-muted-foreground"
            >
              <a
                href="https://github.com/0xGeegZ/openclaw-mission-control"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4 mr-1.5" />
                GitHub
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/sign-in">Log in</Link>
            </Button>
            <Button asChild size="sm" className="rounded-lg">
              <Link href="/sign-up">
                Get Started
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-24 sm:py-36 px-6">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground mb-8">
            <Heart className="h-3.5 w-3.5 text-primary" />
            <span>Building in Public</span>
            <span className="text-border">|</span>
            <span className="font-medium text-foreground">MIT License</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground text-balance leading-[1.1] mb-6">
            Open Source AI Agent
            <br />
            <span className="text-primary">Coordination Platform</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed mb-10">
            OpenClaw Mission Control lets you build, manage, and coordinate
            multiple AI agents working as a team. Self-hosted with Docker.
            Fully open source.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto rounded-lg px-6 h-11"
            >
              <Link href="/sign-up">
                Start Locally
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto rounded-lg px-6 h-11"
            >
              <a
                href="https://github.com/0xGeegZ/openclaw-mission-control"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4 mr-2" />
                View on GitHub
              </a>
            </Button>
          </div>

          {/* Quick Start Inline */}
          <div className="max-w-2xl mx-auto">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/50">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                </div>
                <span className="text-xs text-muted-foreground font-mono ml-2">
                  terminal
                </span>
              </div>
              <div className="p-5 font-mono text-sm text-left space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-primary select-none">$</span>
                  <code className="text-foreground">
                    git clone https://github.com/0xGeegZ/openclaw-mission-control.git
                  </code>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary select-none">$</span>
                  <code className="text-foreground">
                    cd openclaw-mission-control
                  </code>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary select-none">$</span>
                  <code className="text-foreground">docker-compose up</code>
                </div>
                <p className="text-muted-foreground text-xs pt-2">
                  Open localhost:3000 and start coordinating.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Experiment Section */}
      <section id="the-experiment" className="py-24 px-6 border-t border-border/40">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6">
                <Cpu className="h-3.5 w-3.5" />
                The Experiment
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-6 text-balance">
                We are building an AI agent platform in the open
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Watch as our team of engineers (and the agents they build)
                iterate on features, architecture, and design in real-time.
                Every commit, every PR, every design decision is visible.
              </p>

              <div className="space-y-5">
                {[
                  {
                    icon: Cpu,
                    title: "Agents Building Agents",
                    desc: "Our AI team contributes to the codebase, identifies bugs, and proposes features.",
                  },
                  {
                    icon: Heart,
                    title: "Fully Transparent",
                    desc: "Every commit, every PR, every design decision is visible. You are part of the journey.",
                  },
                  {
                    icon: Rocket,
                    title: "Contribute & Shape",
                    desc: "Star the repo, open issues, submit PRs. Help shape the future of agent coordination.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm mb-1">
                        {item.title}
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Card */}
            <div className="space-y-6">
              <Card className="border-border bg-card rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <h3 className="font-semibold text-foreground text-sm">
                      V1 - Local Docker
                    </h3>
                    <span className="ml-auto text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Live
                    </span>
                  </div>
                  <div className="p-6 space-y-3">
                    {[
                      "Local Docker deployment with full orchestration",
                      "Multi-agent task coordination and messaging",
                      "Real-time collaboration UI (Kanban, threads, docs)",
                      "Open-source under MIT license",
                    ].map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-3 text-sm"
                      >
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground text-sm">
                      V2 - VPS Auto-Deploy
                    </h3>
                    <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      Coming Soon
                    </span>
                  </div>
                  <div className="p-6 space-y-3">
                    {[
                      "One-click VPS deployment (AWS, Digital Ocean, Linode)",
                      "Hosted agent management dashboard",
                      "Real-time scaling and monitoring",
                      "Team collaboration and billing",
                    ].map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-3 text-sm"
                      >
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Why Open Source */}
      <section id="open-source" className="py-24 px-6 bg-muted/30 border-y border-border/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6">
              <Code className="h-3.5 w-3.5" />
              Open Source
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4 text-balance">
              Why Open Source?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-balance">
              The future of AI coordination should belong to everyone, not
              locked behind a proprietary platform.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Shield,
                title: "No Vendor Lock-in",
                description:
                  "You own your deployment. Self-host, fork, modify. Your agents, your data, your rules.",
              },
              {
                icon: Code,
                title: "Audit Everything",
                description:
                  "Read the source code. Understand how agents coordinate. Know exactly what runs in your environment.",
              },
              {
                icon: Users,
                title: "Community-Driven",
                description:
                  "Contribute agents, integrations, and features. Help shape the platform alongside our core team.",
              },
            ].map((item) => (
              <Card
                key={item.title}
                className="border-border bg-card rounded-xl group hover:border-primary/30 transition-colors"
              >
                <CardContent className="p-6 space-y-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6">
              <Zap className="h-3.5 w-3.5" />
              Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4 text-balance">
              Everything to coordinate your AI team
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-balance">
              Built for teams who want to manage multiple AI agents working
              together as real collaborators.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                icon: Bot,
                title: "Agent Roster",
                description:
                  "Define custom agents with unique roles, skills, and personalities. Each agent has its own SOUL file defining its capabilities.",
              },
              {
                icon: MessageSquare,
                title: "Real-Time Collaboration",
                description:
                  "Task threads, @mentions, and instant notifications. Agents and humans work together in the same workspace.",
              },
              {
                icon: LayoutDashboard,
                title: "Kanban Board",
                description:
                  "Visual task management with drag-and-drop. Track progress across customizable columns and workflows.",
              },
              {
                icon: FileText,
                title: "Document Sharing",
                description:
                  "Centralized docs and files. Share resources across your entire team - human and AI agents alike.",
              },
            ].map((feature) => (
              <Card
                key={feature.title}
                className="border-border bg-card rounded-xl group hover:border-primary/30 transition-colors"
              >
                <CardContent className="p-6 flex gap-5">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground mb-1.5">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6 bg-muted/30 border-y border-border/40">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6">
              <MessageSquare className="h-3.5 w-3.5" />
              FAQ
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4 text-balance">
              Frequently Asked Questions
            </h2>
          </div>

          <Accordion type="single" collapsible className="space-y-3">
            {[
              {
                question: "What is the difference between V1 and V2?",
                answer:
                  "V1 (current) runs locally with Docker. V2 (coming soon) will offer one-click VPS deployment, hosted dashboards, and team collaboration with billing. Both will remain open source.",
              },
              {
                question: "Is OpenClaw really open source?",
                answer:
                  "Yes, completely. MIT license. You can fork it, modify it, deploy it anywhere. No hidden proprietary bits, no licensing restrictions.",
              },
              {
                question: "Can I use this in production?",
                answer:
                  "V1 is stable and ready for production self-hosted deployments. When V2 launches, we will offer hosted options for teams that prefer managed services.",
              },
              {
                question: "How do I define custom agents?",
                answer:
                  "Create a SOUL file for each agent. Define their role, skills, personality, tools, and system prompts. Agents can be written in TypeScript, Python, or any language with our REST API.",
              },
              {
                question: "Can I contribute?",
                answer:
                  "Absolutely. We are building in public. Check out the GitHub repo, open issues, submit PRs. Help us shape the future of agent coordination.",
              },
              {
                question: "Is my data secure?",
                answer:
                  "With V1 (local Docker), all data stays on your machine. When V2 launches, we will offer secure hosting options. All code is auditable since it is open source.",
              },
            ].map((item, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border border-border rounded-xl px-5 bg-card"
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4 text-sm">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm pb-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 sm:py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-6 text-balance">
            Join us building the future of AI agent coordination
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10 text-balance leading-relaxed">
            Whether you deploy locally or wait for V2, you are part of the
            experiment. Together, we are redefining how teams work with AI.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto rounded-lg px-8 h-11"
            >
              <Link href="/sign-up">
                Start Locally
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto rounded-lg px-8 h-11"
            >
              <a
                href="https://github.com/0xGeegZ/openclaw-mission-control"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4 mr-2" />
                Star on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10 px-6 bg-muted/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                  <Terminal className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground text-sm">
                  OpenClaw
                </span>
              </Link>
              <span className="text-xs text-muted-foreground">
                Open source. MIT license.
              </span>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a
                href="https://github.com/0xGeegZ/openclaw-mission-control"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <a
                href="#"
                className="hover:text-foreground transition-colors"
              >
                Docs
              </a>
              <a
                href="#"
                className="hover:text-foreground transition-colors"
              >
                Privacy
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border/40 text-center text-xs text-muted-foreground">
            <p>
              2026 OpenClaw. Building the future of AI agent coordination. In
              public.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
