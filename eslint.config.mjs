import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: ["src-tauri/", "dist/"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: (await import("@typescript-eslint/parser")).default,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLButtonElement: "readonly",
        KeyboardEvent: "readonly",
        React: "readonly",
        process: "readonly",
        crypto: "readonly",
        localStorage: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
];
