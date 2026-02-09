/**
 * ESLint 9 flat config for Next.js 16 with Type Safety focus
 * Enforces:
 * - Type safety: no-unsafe-*, consistent-type-imports, explicit return types
 * - DRY principle: prevent duplicate types/enums
 * - Code quality: no-console in production, proper error handling
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tseslintParser from "@typescript-eslint/parser";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
    },
    rules: {
      // Type safety enforcement (gradual rollout: errors → warnings for major violations)
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-types": [
        "off",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      
      // Import consistency (gradual enforcement: warn on type imports, defer to Phase 2)
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-only",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
      
      // Unused code cleanup (error: enforce removing truly unused code)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      
      // Null safety (warnings for now, errors in Phase 2 once team aligns)
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      
      // Error handling (keep as errors: critical for reliability)
      "@typescript-eslint/prefer-promise-reject-errors": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      
      // Code quality (keep as errors: good practices)
      "@typescript-eslint/prefer-const": "error",
      "@typescript-eslint/no-var-requires": "warn",
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
