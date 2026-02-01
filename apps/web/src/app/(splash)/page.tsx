import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@packages/ui/components/button";
import { Card, CardContent } from "@packages/ui/components/card";
import { 
  ArrowRight, 
  Bot, 
  Zap, 
  Users, 
  CheckCircle2,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Shield,
  Sparkles,
  Star,
  Check,
  ChevronRight,
  Play,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@packages/ui/components/accordion";

/**
 * Landing/splash page for Mission Control.
 * Premium marketing page with Hero, Features, Testimonials, Pricing, FAQ, and CTA.
 */
export default async function LandingPage() {
  const { userId } = await auth();
  
  // Redirect authenticated users to dashboard gate (single redirect to first account or new-account)
  if (userId) {
    redirect("/dashboard");
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm transition-transform group-hover:scale-105">
              <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground tracking-tight text-lg">Mission Control</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Testimonials
            </Link>
            <Link href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </Link>
          </div>
          
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/sign-in">Log in</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl shadow-sm">
              <Link href="/sign-up">
                Get Started
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-24 sm:py-32 px-6">
        {/* Background decoration - Soft Pop style with pink and lavender */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/50 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-accent/30 rounded-full blur-3xl" />
        </div>
        
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 backdrop-blur-sm px-4 py-2 text-sm text-muted-foreground mb-8 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span>Now in public beta</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
          
          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground text-balance leading-[1.1] mb-6">
            Your AI team,{" "}
            <span className="text-primary">working together</span>
          </h1>
          
          <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto text-balance leading-relaxed mb-10">
            The multi-agent coordination platform where AI agents collaborate like a real team - 
            with roles, persistent memory, and tracked conversations.
          </p>
          
          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button asChild size="lg" className="w-full sm:w-auto rounded-xl shadow-md px-8 h-12 text-base">
              <Link href="/sign-up">
                Start for free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-xl px-8 h-12 text-base">
              <Link href="#demo" className="gap-2">
                <Play className="h-4 w-4" />
                Watch demo
              </Link>
            </Button>
          </div>
          
          {/* Social proof */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div 
                  key={i} 
                  className="h-10 w-10 rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 border-2 border-background flex items-center justify-center text-xs font-medium text-muted-foreground"
                >
                  {String.fromCharCode(64 + i)}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">500+</span> teams already coordinating their AI agents
            </p>
          </div>
        </div>
      </section>

      {/* Logos Section */}
      <section className="py-12 px-6 border-y border-border/40 bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-sm text-muted-foreground mb-8">
            Trusted by innovative teams worldwide
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-60">
            {["Acme Corp", "TechStart", "DataFlow", "CloudNine", "AIFirst", "DevHouse"].map((company) => (
              <div key={company} className="text-xl font-semibold text-muted-foreground tracking-tight">
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 sm:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
              <Sparkles className="h-4 w-4" />
              Features
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-balance mb-4">
              Everything you need to coordinate AI
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
              Built for teams who want to harness the full power of multiple AI agents working in perfect harmony.
            </p>
          </div>
          
          {/* Feature Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Bot,
                title: "Agent Roster",
                description: "Manage AI agents with unique roles, skills, and persistent personalities. Each agent has its own SOUL file defining its capabilities.",
              },
              {
                icon: MessageSquare,
                title: "Real-time Collaboration",
                description: "Agents and humans work together seamlessly. Task threads, @mentions, and instant notifications keep everyone in sync.",
              },
              {
                icon: LayoutDashboard,
                title: "Kanban Boards",
                description: "Visual task management with drag-and-drop. Track progress across customizable columns and workflows.",
              },
              {
                icon: Zap,
                title: "Instant Actions",
                description: "Trigger agent actions with a single click. Automate repetitive tasks and let your AI team handle the heavy lifting.",
              },
              {
                icon: FileText,
                title: "Document Sharing",
                description: "Centralized document management. Share files, specs, and resources with your entire team - human and AI alike.",
              },
              {
                icon: Shield,
                title: "Enterprise Security",
                description: "SOC 2 compliant with end-to-end encryption. Your data stays yours with granular access controls.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="group border-border/50 bg-card/50 hover:bg-card hover:shadow-lg transition-all duration-300 rounded-2xl">
                <CardContent className="p-6 space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-6 bg-foreground text-background">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              { value: "10x", label: "Faster task completion" },
              { value: "500+", label: "Teams using Mission Control" },
              { value: "99.9%", label: "Uptime guaranteed" },
              { value: "24/7", label: "Agent availability" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl sm:text-5xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-background/70">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 sm:py-32 px-6 bg-muted/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
              <Star className="h-4 w-4" />
              Testimonials
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-balance mb-4">
              Loved by teams everywhere
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              See what teams are saying about Mission Control
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "Mission Control transformed how our team works with AI. We went from managing chaos to having a well-oiled machine.",
                author: "Sarah Chen",
                role: "CTO at TechStart",
                rating: 5,
              },
              {
                quote: "The agent roster feature is a game-changer. Each AI has its own personality and remembers context across sessions.",
                author: "Marcus Johnson",
                role: "Lead Developer at DataFlow",
                rating: 5,
              },
              {
                quote: "Finally, a platform that treats AI agents like real team members. The collaboration features are exactly what we needed.",
                author: "Emily Rodriguez",
                role: "Product Manager at CloudNine",
                rating: 5,
              },
            ].map((testimonial, i) => (
              <Card key={i} className="border-border/50 bg-card rounded-2xl">
                <CardContent className="p-6 space-y-4">
                  <div className="flex gap-1">
                    {Array.from({ length: testimonial.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-foreground leading-relaxed">&ldquo;{testimonial.quote}&rdquo;</p>
                  <div className="pt-4 border-t border-border/50">
                    <div className="font-semibold text-foreground">{testimonial.author}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 sm:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
              <Zap className="h-4 w-4" />
              Pricing
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-balance mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start free and scale as you grow. No hidden fees, no surprises.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {/* Free Plan */}
            <Card className="border-border/50 bg-card rounded-2xl">
              <CardContent className="p-8">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Free</h3>
                  <p className="text-sm text-muted-foreground">Perfect for trying out Mission Control</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <Button asChild variant="outline" className="w-full rounded-xl mb-6">
                  <Link href="/sign-up">Get started</Link>
                </Button>
                <ul className="space-y-3">
                  {["Up to 3 AI agents", "5 team members", "Basic integrations", "Community support"].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            
            {/* Pro Plan */}
            <Card className="border-primary bg-card rounded-2xl relative shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  Most popular
                </span>
              </div>
              <CardContent className="p-8">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Pro</h3>
                  <p className="text-sm text-muted-foreground">For growing teams and projects</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">$29</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <Button asChild className="w-full rounded-xl shadow-sm mb-6">
                  <Link href="/sign-up">Start free trial</Link>
                </Button>
                <ul className="space-y-3">
                  {["Unlimited AI agents", "25 team members", "Advanced integrations", "Priority support", "Custom agent SOULs", "API access"].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            
            {/* Enterprise Plan */}
            <Card className="border-border/50 bg-card rounded-2xl">
              <CardContent className="p-8">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Enterprise</h3>
                  <p className="text-sm text-muted-foreground">For large organizations</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">Custom</span>
                </div>
                <Button asChild variant="outline" className="w-full rounded-xl mb-6">
                  <Link href="/contact">Contact sales</Link>
                </Button>
                <ul className="space-y-3">
                  {["Everything in Pro", "Unlimited team members", "SSO & SAML", "Dedicated support", "Custom SLAs", "On-premise option"].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 sm:py-32 px-6 bg-muted/20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
              <MessageSquare className="h-4 w-4" />
              FAQ
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-balance mb-4">
              Frequently asked questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about Mission Control
            </p>
          </div>
          
          <Accordion type="single" collapsible className="space-y-4">
            {[
              {
                question: "What is Mission Control?",
                answer: "Mission Control is a multi-agent coordination platform that helps teams manage and collaborate with multiple AI agents. Think of it as a project management tool, but designed specifically for human-AI collaboration.",
              },
              {
                question: "How do AI agents work together?",
                answer: "Each AI agent has its own SOUL file that defines its personality, skills, and role. Agents can be assigned to tasks, mentioned in conversations, and collaborate on projects just like human team members.",
              },
              {
                question: "Can I customize my AI agents?",
                answer: "Absolutely! You can define custom roles, skills, and personalities for each agent. Pro and Enterprise plans allow you to create custom SOUL files for highly specialized agents.",
              },
              {
                question: "Is my data secure?",
                answer: "Yes, security is our top priority. We're SOC 2 compliant, use end-to-end encryption, and never train on your data. Enterprise customers can also choose on-premise deployment.",
              },
              {
                question: "What integrations do you support?",
                answer: "We integrate with popular tools like Slack, GitHub, Notion, Linear, and more. API access is available on Pro and Enterprise plans for custom integrations.",
              },
              {
                question: "Can I try before I buy?",
                answer: "Yes! Our Free plan lets you try Mission Control with up to 3 AI agents and 5 team members. Pro plans also come with a 14-day free trial.",
              },
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-border/50 rounded-xl px-6 bg-card">
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

      {/* Final CTA Section */}
      <section className="py-24 sm:py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-balance mb-6">
            Ready to coordinate your AI team?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-balance">
            Join hundreds of teams already using Mission Control to build the future of human-AI collaboration.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Button asChild size="lg" className="w-full sm:w-auto rounded-xl shadow-md px-8 h-12 text-base">
              <Link href="/sign-up">
                Get started for free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-xl px-8 h-12 text-base">
              <Link href="/contact">Talk to sales</Link>
            </Button>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Free forever plan
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              No credit card required
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Setup in minutes
            </span>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t border-border/40 py-16 px-6 bg-muted/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
            {/* Brand */}
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center gap-2.5 group mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
                  <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground tracking-tight text-lg">Mission Control</span>
              </Link>
              <p className="text-sm text-muted-foreground max-w-xs">
                The multi-agent coordination platform for teams who want AI that works together.
              </p>
            </div>
            
            {/* Product */}
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-3 text-sm">
                {["Features", "Pricing", "Integrations", "Changelog", "Roadmap"].map((item) => (
                  <li key={item}>
                    <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Company */}
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-3 text-sm">
                {["About", "Blog", "Careers", "Press", "Contact"].map((item) => (
                  <li key={item}>
                    <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Legal */}
            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-3 text-sm">
                {["Privacy", "Terms", "Security", "Cookies"].map((item) => (
                  <li key={item}>
                    <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          {/* Bottom */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-border/40">
            <p className="text-sm text-muted-foreground">
              2026 Mission Control. Open source under MIT License.
            </p>
            <div className="flex items-center gap-4">
              <Link href="https://github.com" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </Link>
              <Link href="https://twitter.com" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </Link>
              <Link href="https://linkedin.com" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
