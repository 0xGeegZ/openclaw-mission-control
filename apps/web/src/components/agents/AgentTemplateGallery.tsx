"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface AgentTemplateGalleryProps {
  accountId: Id<"accounts">;
  onSelectTemplate: (templateId: Id<"agentTemplates">) => void;
}

const CATEGORY_COLORS = {
  management: "bg-blue-100 text-blue-800",
  engineering: "bg-purple-100 text-purple-800",
  qa: "bg-green-100 text-green-800",
  design: "bg-pink-100 text-pink-800",
  content: "bg-amber-100 text-amber-800",
  analytics: "bg-indigo-100 text-indigo-800",
  custom: "bg-gray-100 text-gray-800",
};

export function AgentTemplateGallery({ accountId, onSelectTemplate }: AgentTemplateGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const templates = useQuery(api.agentTemplates.list, {
    accountId,
    category: selectedCategory || undefined,
    searchTerm: searchTerm || undefined,
  });

  const categories = useQuery(api.agentTemplates.getCategories, { accountId });

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (selectedCategory) {
      return templates.filter((t) => t.category === selectedCategory);
    }
    return templates;
  }, [templates, selectedCategory]);

  if (!templates || !categories) {
    return <div className="text-center py-8">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Agent Templates</h2>
        <p className="text-gray-600 mt-1">Choose a template to quickly create a new agent</p>
      </div>

      {/* Search Bar */}
      <input
        type="text"
        placeholder="Search templates..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          onClick={() => setSelectedCategory(null)}
          size="sm"
        >
          All Templates
        </Button>
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            onClick={() => setSelectedCategory(category)}
            size="sm"
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No templates found matching your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <Card
              key={template._id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => onSelectTemplate(template._id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      {template.config.role}
                    </CardDescription>
                  </div>
                  <Badge
                    className={CATEGORY_COLORS[template.category as keyof typeof CATEGORY_COLORS]}
                    variant="outline"
                  >
                    {template.category}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">{template.description}</p>

                {/* Template Stats */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>v{template.version}</span>
                  <span>{template.usageCount} agents created</span>
                </div>

                {/* Default Skills */}
                {template.defaultSkillSlugs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">Key Skills:</p>
                    <div className="flex flex-wrap gap-1">
                      {template.defaultSkillSlugs.slice(0, 3).map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-xs">
                          {skill.replace(/-/g, " ")}
                        </Badge>
                      ))}
                      {template.defaultSkillSlugs.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{template.defaultSkillSlugs.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* CTA Button */}
                <Button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectTemplate(template._id);
                }} 
                className="w-full mt-4"
              >
                Choose Template
              </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
