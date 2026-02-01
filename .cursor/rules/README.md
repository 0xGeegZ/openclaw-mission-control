# Cursor Rules

This directory contains AI agent rules for the Cursor IDE to help maintain consistency across the project.

## Files

### 00-pr-description.mdc

Generic template for generating PR descriptions from git diffs. Helps create consistent, minimal pull request descriptions.

### 01-project-overview.mdc (Always Applied)

**Project-Specific Section:**

- Overview of the current Next.js + Convex chat application
- Tech stack: Next.js 15, React 19, Convex, Convex Auth, shadcn/ui, Tailwind CSS
- Project structure specific to this application

**Generic Sections (reusable across projects):**

- General coding rules and best practices
- TypeScript and React conventions
- Component structure guidelines
- Debugging and logging practices
- Comments and documentation standards
- Forms handling patterns
- Styling rules with Tailwind CSS
- Import and naming conventions
- Environment variables management
- Type rules and patterns
- Testing approaches
- Deployment guidelines

### 02-ui-components.mdc

Generic UI component guidelines for Next.js + React + shadcn/ui projects:

- Component structure and organization
- TypeScript usage
- Styling with Tailwind CSS
- Form handling with React Hook Form + Zod
- Performance optimization
- Accessibility standards

### 03-api-routes.mdc

Generic guidelines for Next.js API routes:

- Route structure and organization
- Request/response handling
- Input validation with Zod
- Error handling patterns
- Authentication patterns
- Optional rate limiting

### 04-server-actions.mdc

Generic guidelines for Next.js Server Actions:

- Server action structure
- Consistent response types
- Input validation
- Error handling
- Path revalidation
- Note: For Convex projects, prefer Convex mutations/actions

## Usage

### For This Project

The rules are already configured and work out of the box.

### For New Projects

To reuse these rules in a new project:

1. Copy the entire `.cursor/rules/` directory to your new project
2. Update **only the project-specific section** in `01-project-overview.mdc`:
   - Update the "Overview" section with your project description
   - Update the "Tech Stack" section with your technologies
   - Update the "Project Structure" section to match your folder layout
3. Keep all the generic rules sections as-is (they're designed to be reusable)
4. Optionally adjust other rule files if your project uses different patterns

### Applying Rules

- `01-project-overview.mdc` is always applied to all files
- Other rules are applied based on file patterns (globs) when relevant
- Rules can be fetched explicitly using the `@` mention in Cursor

## Customization

Feel free to modify rules to match your team's coding standards, but keep the distinction between:

- **Project-specific sections**: Update for each new project
- **Generic sections**: Keep consistent across projects for better AI assistance
