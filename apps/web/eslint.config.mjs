import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      /*
       * react-hooks/set-state-in-effect
       *
       * Downgraded from error to warning, deliberately and temporarily.
       *
       * React 19.2 added this rule. It fires on the standard client-side
       * data-fetching pattern used throughout this codebase:
       *
       *     const load = useCallback(async () => { ... setData(x) }, [deps]);
       *     useEffect(() => { void load(); }, [load]);
       *
       * The rule is right that this causes an extra render pass, and the
       * better answer is usually a Server Component or a fetching library.
       * But it currently fires in ~30 files, and rewriting all of them at
       * once is a larger and riskier change than the problem warrants.
       *
       * Kept as a warning so the count stays visible rather than forgotten.
       * The intended fix is to migrate these pages to Server Components
       * incrementally, dropping this override once the count reaches zero.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Test files legitimately import dev dependencies and use loose shapes
    // when constructing fixtures.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
