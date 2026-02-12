"use client";

import { type Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import { RotateCw, Zap } from "lucide-react";

interface AgentControlsCardProps {
  isAdmin: boolean;
}

/**
 * Agent control buttons card (admin only).
 * MVP: Restart and Send Heartbeat are disabled/read-only UI indicators.
 * Future mutations will enable these actions.
 */
export function AgentControlsCard({
  isAdmin,
}: AgentControlsCardProps) {
  // MVP: Buttons are disabled (read-only indicators)
  const isDisabled = true;

  const handleRestart = () => {
    // TODO: Implement agents.restart mutation
  };

  const handleSendHeartbeat = () => {
    // TODO: Implement agents.sendHeartbeat mutation
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Agent controls
        </CardTitle>
        <CardDescription className="text-xs">
          Agent operations (MVP: read-only indicators; mutations coming soon)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDisabled || !isAdmin}
                  onClick={handleRestart}
                  className="w-full"
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  Restart Agent
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {!isAdmin
                ? "Only admins can restart agents"
                : "Restart the agent runtime (coming soon)"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDisabled || !isAdmin}
                  onClick={handleSendHeartbeat}
                  className="w-full"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Send Heartbeat
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {!isAdmin
                ? "Only admins can send heartbeats"
                : "Trigger agent heartbeat manually (coming soon)"}
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}
