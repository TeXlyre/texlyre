# Interaction summaries

This file records the main forms of AI interaction used in TeXlyre development. The examples are summaries of recurring requests.

## Existing implementation change

Context supplied:

- current source
- expected behaviour
- relevant interface or method constraints

Request:

- identify the smallest implementation change required
- preserve existing interfaces and unrelated behaviour
- avoid additional state, listeners, effects, or dependencies unless required

Typical output:

- a local code patch or replacement method

## Related API adaptation

Context supplied:

- an existing provider or integration
- the target provider API
- the interfaces already used by TeXlyre

Request:

- identify provider-specific differences
- retain the established TeXlyre interface and control flow

Typical output:

- adapted provider methods, request handling, or configuration

## Regression analysis

Context supplied:

- current code or diff
- observed regression
- failing test or browser behaviour
- earlier working behaviour when available

Request:

- identify the source of the regression
- propose a local correction
- keep unrelated behaviour unchanged

Typical output:

- diagnosis and targeted patch

## Refactoring review

Context supplied:

- existing implementation
- current tests or behaviour

Request:

- identify duplicated logic, unnecessary state, effects, listeners, or redundant styles
- simplify without changing behaviour

Typical output:

- smaller implementation or consolidated styles

## Configuration and automation

Context supplied:

- current project configuration
- required tool or workflow

Request:

- prepare or update conventional configuration using the repository's existing structure

Typical output:

- lint, build, or CI configuration fragments

## Validation

AI output is not treated as a verification step. Changes are checked using the validation appropriate to the affected area, including tests, builds, manual interaction checks, and comparison with known working behaviour.
