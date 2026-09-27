import nextConfig from "eslint-config-next/core-web-vitals";
import nextTsConfig from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "backend/.venv/**",
      "desktop/dist/**",
      "desktop/python/build/**",
      "desktop/python/dist/**",
      "desktop/src-tauri/binaries/**",
      "desktop/src-tauri/target/**",
      "dist/**",
    ],
  },
  ...nextConfig,
  ...nextTsConfig,
  {
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
