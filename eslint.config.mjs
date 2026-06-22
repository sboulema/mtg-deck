import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores([
        "**/node_modules",
        "**/build",
        "main.js",
        "jest/**/*",
        "**/*.test.ts",
        "**/*.spec.ts",
    ]),
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...obsidianmd.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },

            ecmaVersion: 2020,
            sourceType: "module",

            parserOptions: {
                projectService: {
                    allowDefaultProject: ["*.mjs", "*.js"],
                },
            },
        },

        rules: {
            "no-unused-vars": "off",

            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "none",
                },
            ],

            "@typescript-eslint/ban-ts-comment": "off",
            "no-prototype-builtins": "off",
            "@typescript-eslint/no-empty-function": "off",

            "obsidianmd/ui/sentence-case": [
                "warn",
                {
                    brands: ["Scryfall", "MTG"],
                },
            ],
        },
    },
]);