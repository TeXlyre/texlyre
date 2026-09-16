# Anthropic Claude

## Model

Anthropic Claude. The exact historical model version was not recorded.

## Uses

Claude was used during earlier TeXlyre development for a limited set of implementation and debugging tasks:

| Area                    | Use                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Editor toolbar          | Changes to existing handlers for inserting environments and applying text formatting |
| Repository integrations | Adaptation of the existing GitHub integration for GitLab and Gitea                   |
| Typst support           | Adaptation of existing LaTeX-facing interfaces for corresponding Typst functionality |
| Project tooling         | ESLint/Biome configuration and GitHub Actions boilerplate                            |
| Demo interfaces         | Small UI components following existing TeXlyre examples and styling                  |
| Dependency updates      | Diagnosis of errors following React, Vite, Pdf.js, and related API changes           |

## Interaction pattern

The relevant TeXlyre files and a defined task were supplied as context. Requests specified the existing interface or behaviour to preserve and asked for changes within that scope.

Typical requests covered:

- modifying an existing method or component
- identifying provider-specific API differences
- translating an existing integration pattern to a related interface
- preparing conventional configuration
- identifying the cause of a regression

Output consisted of proposed code edits, configuration fragments, or debugging suggestions. Changes were reviewed and adjusted before integration. Suggestions that did not resolve the task or fit the surrounding implementation were discarded.
