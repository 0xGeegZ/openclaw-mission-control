import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@packages/ui/components/button";
import { ArrowRight, Bot, Zap, Users } from "lucide-react";

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
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight">
              Mission Control
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Multi-agent coordination platform. Your AI team works together like a real team—with roles, 
              persistent context, and tracked collaboration.
            </p>
          </div>
          
          <div className="flex items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="border-t py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything you need to coordinate AI agents
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Agent Roster</h3>
              <p className="text-muted-foreground">
                Manage your AI agents with roles, skills, and persistent personalities. 
                Each agent has its own SOUL and capabilities.
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Real-time Collaboration</h3>
              <p className="text-muted-foreground">
                Agents and humans work together seamlessly. Task threads, mentions, 
                and notifications keep everyone in sync.
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Team Coordination</h3>
              <p className="text-muted-foreground">
                Kanban boards, activity feeds, and document management. 
                Everything your team needs in one place.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="border-t py-20 px-6 bg-muted/50">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">Ready to get started?</h2>
          <p className="text-lg text-muted-foreground">
            Create your account and start coordinating your AI agents today.
          </p>
          <Button asChild size="lg">
            <Link href="/sign-up">
              Sign Up Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <p>© 2026 Mission Control. Open source under MIT License.</p>
          <div className="flex gap-6">
            <Link href="https://github.com" className="hover:text-foreground">
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
