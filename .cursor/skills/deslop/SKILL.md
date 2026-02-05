---
name: deslop
description: Remove AI code slop
disable-model-invocation: true
---

# Remove AI code slop

Check the diff against main, and remove all AI generated slop introduced in this branch.

This includes:

- Commented-out code that should be removed or implemented (not TODO/FIXME comments - keep those)
- Casts to `any` to get around type issues (fix with proper types instead)
- Extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by
  trusted / validated codepaths)
- Comments that ONLY restate what the code does without adding context (keep comments that explain "why" or provide
  important context)
- Avoid re exporting type from a different file

**IMPORTANT**: Be conservative with comments. Only remove comments that are clearly redundant or explain obvious things.

Keep:

- TODO/FIXME comments (they mark work to be done)
- JSDoc comments that document functions/components
- Comments explaining "why" something is done
- Comments providing context about non-obvious logic
- Comments that match the style of the existing codebase

Report at the end with only a 1-3 sentence summary of what you changed
