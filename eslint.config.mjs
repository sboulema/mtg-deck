import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import obsidianmd from "eslint-plugin-obsidianmd";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([
    globalIgnores(["**/npm node_modules", "**/build", "main.js"]),

    // Legacy plugins shimmed via FlatCompat
    ...compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
    ),

    // Native flat config plugin — must be spread directly, not via compat
    ...obsidianmd.configs.recommended,

    // Disable mobile-safety rules for test files — they never run in Obsidian
    {
        files: ["jest/**/*", "**/*.test.ts", "**/*.spec.ts"],
        rules: {
            "obsidianmd/no-nodejs-modules": "off",
        },
    },

    // Your project rules
    {
        plugins: {
            "@typescript-eslint": typescriptEslint,
        },
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parser: tsParser,
            ecmaVersion: 5,
            sourceType: "module",
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["*.mjs", "*.js"],
                },
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", {
                args: "none",
            }],
            "@typescript-eslint/ban-ts-comment": "off",
            "no-prototype-builtins": "off",
            "@typescript-eslint/no-empty-function": "off",
            "obsidianmd/ui/sentence-case": [
                "warn",
                {
                    brands: ["Scryfall", "MTG"]
                },
            ],
        },
    }
]);
