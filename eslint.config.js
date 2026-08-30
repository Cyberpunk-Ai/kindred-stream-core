import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message:
                "Do not use the vendor SDK directly. Import `backend` from `@/backend` so the provider stays swappable via env.",
            },
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Tracked technical debt: `any` is reported but does not fail CI. New code
      // should use precise types or `unknown`; the count should trend to zero.
      // Disabled for now as it represents legacy code patterns. Migrate gradually.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // The adapter layer and server-only modules are the only places allowed to
    // touch a provider SDK directly.
    files: [
      "src/backend/**/*.ts",
      "src/integrations/**/*.ts",
      "src/**/*.server.ts",
      "src/**/*.functions.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // App code talks to the backend only through the provider-agnostic layer.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/backend/**",
      "src/integrations/**",
      "src/**/*.server.ts",
      "src/**/*.functions.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/integrations/supabase/client", "@/integrations/supabase/client.server"],
              message:
                "Import `backend` from `@/backend` instead of the vendor client so data/auth/storage/realtime stay swappable via env.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
