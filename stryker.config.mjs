// Mutation testing, run on request only (`bash scripts/gates.sh --gate
// mutation`, via /audit-mutations). The command runner, not the vitest runner
// plugin: under Vitest 5 the plugin runs no tests and still reports a score
// (node-typescript profile, issue #104). TypeScript here is 5.9, so the
// tsconfig preprocessor works and tsconfigFile is left at its default.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "command",
  commandRunner: { command: "pnpm exec vitest run --project unit" },
  coverageAnalysis: "off",
  timeoutMS: 60000,
  mutate: [
    "src/**/*.{ts,tsx}",
    "shared/**/*.ts",
    "!src/**/*.test.{ts,tsx}",
    "!shared/**/*.test.ts",
    "!src/test/**",
    "!src/main.tsx",
  ],
  reporters: ["clear-text", "progress"],
  plugins: [],
};
