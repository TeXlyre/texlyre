# OpenAI ChatGPT

## Model

OpenAI GPT-5.6 has been used for recent TeXlyre maintenance and refactoring. Earlier ChatGPT sessions did not consistently retain the exact model version.

## Uses

Recent use has focused on existing TeXlyre code:

| Area                  | Use                                                                             |
| --------------------- | ------------------------------------------------------------------------------- |
| UI and CSS            | Regression analysis, selector tracing, style consolidation, and cleanup         |
| Editor                | Review of existing state, event, and view handling and targeted bug fixes       |
| Renderers             | Scrolling, highlighting, layout, and source-map regression analysis             |
| Git/history/review UI | Review of merge, history, branch, and annotation behaviour                      |
| Services              | Refactoring and separation of existing responsibilities                         |
| Tests                 | Analysis of failures after implementation changes and updates to affected tests |

## Interaction pattern

Sessions normally include one or more of:

- the current source file
- a diff
- a failing test or build error
- a description of the observed behaviour
- a reference to an earlier working implementation

Requests are scoped to the affected implementation. The expected result is usually a local patch, CSS change, test change, or explanation of the failure. Suggested changes are reviewed against the existing code and tested before inclusion.
