import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@packages/ui/components/button";
import { Card, CardContent } from "@packages/ui/components/card";
import { 
  ArrowRight,
  Github,
  Copy,
  Check,
  Star,
  Heart,
  Zap,
  Shield,
  Code,
  Users,
  Cpu,
  Rocket,
  ChevronRight,
  Terminal,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@packages/ui/components/accordion";

/**
 * Landing page for OpenClaw Mission Control V1
 * Emphasizes: Open Source Foundation, Docker Local Deployment (V1), Building-in-Public Experiment
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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg">
              <svg className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="currentColor">
                {/* Logo SVG: Interconnected agent nodes */}
                <circle cx="12" cy="12" r="2" opacity="0.8"/>
                <circle cx="7" cy="7" r="2" opacity="0.6"/>
                <circle cx="17" cy="7" r="2" opacity="0.6"/>
                <circle cx="7" cy="17" r="2" opacity="0.6"/>
                <circle cx="17" cy="17" r="2" opacity="0.6"/>
                <line x1="12" y1="12" x2="7" y2="7" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
                <line x1="12" y1="12" x2="17" y2="7" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
                <line x1="12" y1="12" x2="7" y2="17" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
                <line x1="12" y1="12" x2="17" y2="17" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
              </svg>
            </div>
            <span className="font-semibold text-foreground tracking-tight text-base">OpenClaw Mission Control</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#the-experiment" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              The Experiment
            </a>
            <a href="#open-source" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Open Source
            </a>
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </a>
          </div>
          
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex rounded-lg">
              <a href="https://github.com/0xGeegZ/openclaw-mission-control" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4 mr-1.5" />
                Star on GitHub
              </a>
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
      <section className="relative py-20 sm:py-28 px-6">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
        </div>
        
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-4 py-2 text-sm text-muted-foreground mb-6">
            <Heart className="h-4 w-4 text-red-500 fill-red-500" />
            <span>Building in Public</span>
          </div>
          
          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground text-balance leading-[1.1] mb-6">
            Open Source AI Agent Coordination
            <br/>
            <span className="text-primary">Built by Agents, For Agents</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto text-balance leading-relaxed mb-8">
            OpenClaw Mission Control is an open-source platform for coordinating multiple AI agents. V1 runs locally with Docker. Watch as we build V2 with auto-deploy to your VPS—right here in the open.
          </p>
          
          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button asChild size="lg" className="w-full sm:w-auto rounded-lg px-6 h-12 text-base">
              <Link href="/sign-up">
                Start Locally
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-lg px-6 h-12 text-base">
              <a href="https://github.com/0xGeegZ/openclaw-mission-control" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4 mr-2" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="py-16 px-6 bg-muted/30 border-y border-border/40">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Get Started in 3 Commands
            </h2>
            <p className="text-muted-foreground">
              V1 runs locally with Docker. No cloud account needed.
            </p>
          </div>
          
          {/* Code Block */}
          <Card className="border border-border/60 bg-[#0f172a] rounded-lg overflow-hidden">
            <CardContent className="p-6 font-mono text-sm text-[#e2e8f0]">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-muted-foreground select-none">$</span>
                  <code>git clone https://github.com/0xGeegZ/openclaw-mission-control.git</code>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-muted-foreground select-none">$</span>
                  <code>cd openclaw-mission-control</code>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-muted-foreground select-none">$</span>
                  <code>docker-compose up</code>
                </div>
              </div>
              <p className="text-[#94a3b8] text-xs mt-4">
                That's it. Open localhost:3000 and start building.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* The Experiment Section */}
      <section id="the-experiment" className="py-24 sm:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-6">
                The Experiment
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                We're building an open-source AI agent coordination platform—in public. Watch as our team of engineers (and the agents they build) iterate on features, architecture, and design in real-time.
              </p>
              <div className="space-y-4 mb-8">
                <div className="flex gap-4">
                  <Cpu className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Agents Building Agents</h3>
                    <p className="text-muted-foreground text-sm">Our AI team contributes to the codebase, identifies bugs, and proposes features.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Heart className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Building in Public</h3>
                    <p className="text-muted-foreground text-sm">Every commit, every PR, every design decision is visible. You're part of the journey.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Rocket className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Follow Along & Contribute</h3>
                    <p className="text-muted-foreground text-sm">Star the repo, open issues, submit PRs. Help shape the future of agent coordination.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <Card className="bg-muted/40 border-border/60 rounded-lg p-8">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-primary" />
                  Current Status: V1 (Local Docker)
                </h3>
                <ul className="space-y-3 text-sm text-muted-foreground mb-6">
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span>Local Docker deployment with full orchestration</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span>Multi-agent task coordination and messaging</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span>Real-time collaboration UI (Kanban, threads, docs)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span>Open-source under MIT license</span>
                  </li>
                </ul>
                
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2 mt-8">
                  <Rocket className="h-5 w-5 text-primary" />
                  Coming in V2: VPS Auto-Deploy
                </h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>One-click VPS deployment (AWS, Digital Ocean, Linode)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>Hosted agent management dashboard</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>Real-time scaling and monitoring</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>Team collaboration and billing</span>
                  </li>
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section id="open-source" className="py-24 sm:py-32 px-6 bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              Why Open Source?
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              OpenClaw Mission Control is fundamentally open source because the future of AI coordination should belong to everyone, not locked behind a proprietary platform.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-border/50 bg-card/30 rounded-lg">
              <CardContent className="p-6 space-y-4">
                <Shield className="h-8 w-8 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">No Vendor Lock-in</h3>
                <p className="text-muted-foreground text-sm">
                  You own your deployment. Self-host, fork, modify. Your agents, your data, your rules.
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-border/50 bg-card/30 rounded-lg">
              <CardContent className="p-6 space-y-4">
                <Code className="h-8 w-8 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Audit Everything</h3>
                <p className="text-muted-foreground text-sm">
                  Read the source code. Understand how agents coordinate. Know exactly what runs in your environment.
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-border/50 bg-card/30 rounded-lg">
              <CardContent className="p-6 space-y-4">
                <Users className="h-8 w-8 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Community-Driven</h3>
                <p className="text-muted-foreground text-sm">
                  Contribute agents, integrations, and features. Help shape the platform alongside our core team.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 sm:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              Powerful Features for Team Coordination
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to build, manage, and monitor your AI agent team.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Users,
                title: "Agent Roster",
                description: "Define custom agents with unique roles, skills, and personalities. Each agent has its own SOUL file.",
              },
              {
                icon: Zap,
                title: "Real-Time Collaboration",
                description: "Task threads, @mentions, and instant notifications. Agents and humans work together seamlessly.",
              },
              {
                icon: Code,
                title: "Kanban Board",
                description: "Visual task management with drag-and-drop. Track progress across customizable workflows.",
              },
              {
                icon: Heart,
                title: "Document Sharing",
                description: "Centralized docs and files. Share resources with your entire team—human and AI alike.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="border-border/50 bg-card/40 rounded-lg hover:bg-card/60 transition-colors">
                <CardContent className="p-6 space-y-4">
                  <feature.icon className="h-8 w-8 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 sm:py-32 px-6 bg-muted/20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          
          <Accordion type="single" collapsible className="space-y-3">
            {[
              {
                question: "What's the difference between V1 and V2?",
                answer: "V1 (current) runs locally with Docker. V2 (coming soon) will offer one-click VPS deployment, hosted dashboards, and team collaboration with billing. Both will remain open source.",
              },
              {
                question: "Is OpenClaw really open source?",
                answer: "Yes, completely. MIT license. You can fork it, modify it, deploy it anywhere. No hidden proprietary bits, no licensing restrictions.",
              },
              {
                question: "Can I use this in production?",
                answer: "V1 is stable and ready for production self-hosted deployments. When V2 launches, we'll offer hosted options for teams that prefer managed services.",
              },
              {
                question: "How do I define custom agents?",
                answer: "Create a SOUL file for each agent. Define their role, skills, personality, tools, and system prompts. Agents can be written in TypeScript, Python, or any language with our REST API.",
              },
              {
                question: "Can I contribute?",
                answer: "Absolutely! We're building in public. Check out the GitHub repo, open issues, submit PRs. Help us shape the future of agent coordination.",
              },
              {
                question: "Is my data secure?",
                answer: "With V1 (local Docker), all data stays on your machine. When V2 launches, we'll offer secure hosting options. All code is auditable since it's open source.",
              },
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-border/50 rounded-lg px-6 bg-card/40">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 sm:py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-6">
            Join Us Building the Future of AI Agent Coordination
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Whether you deploy locally or wait for V2, you're part of the experiment. Together, we're redefining how teams work with AI.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="w-full sm:w-auto rounded-lg px-8 h-12">
              <Link href="/sign-up">
                Start Locally
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-lg px-8 h-12">
              <a href="https://github.com/0xGeegZ/openclaw-mission-control" target="_blank" rel="noopener noreferrer">
                <Star className="h-4 w-4 mr-2" />
                Star on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Missing Elements Section */}
      <section className="py-12 px-6 bg-yellow-50/5 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Missing Elements (To Be Added Post-Launch)
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Discord invite link (community support channel)</li>
            <li>• Twitter/X account (announcements and updates)</li>
            <li>• V2 waitlist form (coming soon feature signup)</li>
            <li>• Blog/docs site URL (tutorials and guides)</li>
            <li>• Production-ready Docker Hub namespace (openclaw/mission-control)</li>
            <li>• Custom logo asset (high-res SVG and PNG variations)</li>
          </ul>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t border-border/40 py-12 px-6 bg-muted/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <Link href="/" className="flex items-center gap-2 mb-2">
                <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="2"/>
                  <circle cx="7" cy="7" r="1.5" opacity="0.6"/>
                  <circle cx="17" cy="7" r="1.5" opacity="0.6"/>
                  <circle cx="7" cy="17" r="1.5" opacity="0.6"/>
                  <circle cx="17" cy="17" r="1.5" opacity="0.6"/>
                </svg>
                <span className="font-semibold text-foreground text-sm">OpenClaw Mission Control</span>
              </Link>
              <p className="text-xs text-muted-foreground">
                Open source. MIT license. <a href="https://github.com/0xGeegZ/openclaw-mission-control" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
              </p>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="https://github.com/0xGeegZ/openclaw-mission-control" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                GitHub
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Docs
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Privacy
              </a>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-border/40 text-center text-xs text-muted-foreground">
            <p>© 2026 OpenClaw. Building the future of AI agent coordination. In public.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Placeholder for AlertCircle icon (simple implementation)
function AlertCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
