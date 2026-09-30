# Generative AI use

TeXlyre uses generative AI for selected development and maintenance work.

The documented uses include:

- scoped changes to existing code
- adaptation of existing integrations to related APIs, such as adapting the GitHub integration for GitLab and Gitea
- routine project configuration, including test, package, lint, and workflow configuration
- debugging and regression analysis
- code review and refactoring
- tests and documentation associated with those changes

The tools documented here are:

- [Anthropic Claude](ANTHROPIC_CLAUDE.md)
- [OpenAI ChatGPT](OPENAI_CHATGPT.md)

[INTERACTION_SUMMARIES.md](INTERACTION_SUMMARIES.md) records the main forms of interaction used with these tools. [CONTRIBUTION_LOG.md](CONTRIBUTION_LOG.md) records AI-assisted work by area.

AI-assisted changes are reviewed in the surrounding source before integration. Validation may include targeted tests, full test runs, builds, browser checks, and comparison with an earlier working implementation. Generated suggestions that introduce unrelated behaviour, unnecessary dependencies, or unclear licensing are not retained.

Project architecture, feature scope, public APIs, integration decisions, and release decisions remain under maintainer control.
