import raycastConfig from "@raycast/eslint-config";

export default [
  {
    // Third-party source vendored verbatim (UPNG quantizer) — not ours to restyle.
    ignores: ["src/lib/vendor/**"],
  },
  ...raycastConfig,
];
