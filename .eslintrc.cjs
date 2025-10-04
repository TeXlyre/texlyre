module.exports = {
	root: true,
	env: {
		browser: true,
		es2020: true,
	},
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:react-hooks/recommended",
	],
	ignorePatterns: ["dist", ".eslintrc.cjs", "vite.config.ts"],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: "./tsconfig.json",
		tsconfigRootDir: __dirname,
		ecmaVersion: 2020,
		sourceType: "module",
	},
	plugins: ["react-refresh", "@typescript-eslint"],
	rules: {
		"react-refresh/only-export-components": [
			"warn",
			{ allowConstantExport: true },
		],
		"@typescript-eslint/naming-convention": "warn",
		"quotes": ["error", "single", { avoidEscape: true }],
	},
	overrides: [
		{
			files: ["*.ts", "*.tsx"],
			rules: {
				"@typescript-eslint/no-unused-vars": [
					"error",
					{
						argsIgnorePattern: "^_",
						varsIgnorePattern: "^_",
						caughtErrorsIgnorePattern: "^_",
					},
				],
				"@typescript-eslint/naming-convention": [
					"error",
					{
						selector: ["variable", "parameter", "property"],
						format: ["camelCase", "PascalCase", "UPPER_CASE"],
						leadingUnderscore: "allow",
						trailingUnderscore: "allow",
					},
					{
						selector: "function",
						format: ["camelCase", "PascalCase"],
					},
					{
						selector: ["typeLike", "class", "interface", "enum"],
						format: ["PascalCase"],
					},
					{
						selector: "objectLiteralProperty",
						format: null,
					},
				],
				"@typescript-eslint/no-explicit-any": [
					"warn",
					{ ignoreRestArgs: true },
				],
			},
		},
	],
};
