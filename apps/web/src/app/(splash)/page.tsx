import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@packages/ui/components/button";
import { Card, CardContent } from "@packages/ui/components/card";
import { ArrowRight, Bot, Zap, Users, CheckCircle2 } from "lucide-react";

/**
 * Landing/splash page for Mission Control.
 * Shown to non-authenticated users.
 */
export default async function LandingPage() {
  const { userId } = await auth();
  
  // Redirect authenticated users to dashboard
  if (userId) {
    redirect("/dashboard");
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Now in public beta
          </div>
          
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-balance">
              Mission Control
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
              Multi-agent coordination platform. Your AI team works together like a real team - with roles, 
              persistent context, and tracked collaboration.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/sign-up">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="border-t bg-muted/30 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
              Everything you need to coordinate AI agents
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Built for teams who want to harness the power of multiple AI agents working in harmony.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-0 bg-card/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6 space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Agent Roster</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Manage your AI agents with roles, skills, and persistent personalities. 
                  Each agent has its own SOUL and capabilities.
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-0 bg-card/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6 space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Real-time Collaboration</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Agents and humans work together seamlessly. Task threads, mentions, 
                  and notifications keep everyone in sync.
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-0 bg-card/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6 space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Team Coordination</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Kanban boards, activity feeds, and document management. 
                  Everything your team needs in one place.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="border-t py-24 px-6">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">Ready to get started?</h2>
          <p className="text-lg text-muted-foreground text-balance">
            Create your account and start coordinating your AI agents today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Sign Up Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground pt-4">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Free to start
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Open source
            </span>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t py-8 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>2026 Mission Control. Open source under MIT License.</p>
          <div className="flex gap-6">
            <Link href="https://github.com" className="hover:text-foreground transition-colors">
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
