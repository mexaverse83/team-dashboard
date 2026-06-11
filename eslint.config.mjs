import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...coreWebVitals,
  {
    ignores: ["node_modules/**", ".next/**", "out/**"],
  },
  {
    // React-Compiler-era strictness (purity, setState-in-effect, ref timing)
    // flags ~20 long-standing patterns across the finance components. Surface
    // them as warnings to fix incrementally rather than blocking the build.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Test files: anonymous stub components in vi.mock factories are fine.
    files: ["tests/**"],
    rules: {
      "react/display-name": "off",
    },
  },
];

export default config;
