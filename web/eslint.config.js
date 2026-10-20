import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  // `routeTree.gen.ts` is the router's generated output.
  globalIgnores(["dist", ".tanstack", "src/routeTree.gen.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Must stay last among the shared configs: turns off every rule that would
  // fight Prettier over formatting.
  eslintConfigPrettier,
  {
    // Import order is owned by @trivago/prettier-plugin-sort-imports, so ESLint
    // must not have an opinion on it.
    rules: {
      "sort-imports": "off",
      "import/order": "off",
    },
  },
  {
    // Same limits as the other team frontends: split a function once it branches
    // this much, instead of raising the limit.
    files: ["**/*.{ts,tsx}"],
    plugins: { sonarjs },
    rules: {
      complexity: ["error", 15],
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
  {
    // shadcn primitives and the template's form wrappers. ESLint's `complexity` counts every
    // prop default and `?.`, so these simple, prop-heavy components score high without having
    // branching logic worth splitting. Cognitive complexity still applies to them.
    files: ["src/components/ui/**/*.tsx", "src/components/form/**/*.tsx"],
    rules: {
      complexity: "off",
    },
  },
  {
    // Route files export a `Route` object and keep their component local so
    // the TanStack Router code-splitter can extract it. The splitter injects
    // its own HMR handling, so this rule is a false positive here.
    files: ["src/routes/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // shadcn components ship variants (`buttonVariants`) and context hooks
    // (`useSidebar`) alongside their components, by convention. Losing fast
    // refresh in the primitives isn't worth splitting every file in two.
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
