# AI-assisted contribution log

This log groups substantive AI-assisted work by development area. It records the available model information, the type of assistance, and how the result was integrated.

## Earlier development

### Editor toolbar

**Tool:** Anthropic Claude  
**Version:** Exact historical version not recorded  
**Reference:** [LaTeX and Typst toolbar implementation](https://github.com/TeXlyre/texlyre/commit/98493ac77f500c2e2970bf2d5f543e41c93adcd3)  
**Assistance:** Proposed changes to existing toolbar handlers for inserting environments, applying text formatting, and related editor actions.  
**Interaction summary:** Existing toolbar/editor code and the required action were supplied. Requests were limited to the affected handlers and existing APIs.  
**Output:** Local code changes to existing editor functionality.  
**Review:** Changes were edited and integrated against the existing editor implementation.

### Repository provider adaptations

**Tool:** Anthropic Claude  
**Version:** Exact historical version not recorded  
**Reference:** [GitLab, Gitea, and Forgejo backup support](https://github.com/TeXlyre/texlyre/commit/045e88456a370762d5cc857976537a615330fc1f)  
**Assistance:** Adaptation of the existing GitHub repository integration for GitLab and Gitea APIs.  
**Interaction summary:** The GitHub provider was used as the reference implementation. Requests focused on provider-specific API changes while keeping the established TeXlyre interfaces.  
**Output:** Provider-specific methods and configuration changes.  
**Review:** API differences and integration behaviour were reviewed and adjusted in the repository implementations.

### Typst interface adaptations

**Tool:** Anthropic Claude  
**Version:** Exact historical version not recorded  
**Reference:** [Typst integration](https://github.com/TeXlyre/texlyre/commit/9d9af687ae7df824966dc099eafa8ce5494b8fff)  
**Assistance:** Adaptation of existing LaTeX-facing interfaces for corresponding Typst functionality.  
**Interaction summary:** Existing LaTeX components and services were supplied as structural references together with the [typst.ts](https://github.com/Myriad-Dreamin/typst.ts)-specific requirement.  
**Output:** Local interface and service changes.  
**Review:** Language-specific behaviour and integration were checked in TeXlyre.

### Project configuration

**Tool:** Anthropic Claude  
**Version:** Exact historical version not recorded  
**References:** [Biome cleanup](https://github.com/TeXlyre/texlyre/commit/4527586dae71438541212bf4f81a10ca15faa735), [test workflow update](https://github.com/TeXlyre/texlyre/commit/126ab6ddca534d1113b92d703cbe2d974475c521)  
**Assistance:** Conventional ESLint, Biome, package, and GitHub Actions configuration.  
**Interaction summary:** Existing project configuration and the required tools were supplied. Documentation, pseudocode, or API references were provided when investigating compatibility issues or upstream changes.  
**Output:** Configuration and workflow fragments.  
**Review:** Resulting configuration was checked through the relevant tooling and repository workflows.

### Demonstration interfaces

**Tool:** Anthropic Claude  
**Version:** Exact historical version not recorded  
**Reference:** [LTR/RTL demonstration control](https://github.com/TeXlyre/texlyre/commit/dc24505b42a0b532fa339830c5352fa0dae5f54e)  
**Assistance:** Small demonstration UI components following existing TeXlyre libraries and examples.  
**Interaction summary:** Existing components and visual conventions were supplied as references.  
**Output:** UI component and configuration fragments.  
**Review:** Components were adjusted to match the existing project structure and styling.

### Dependency and API debugging

**Tool:** Anthropic Claude  
**Version:** Exact historical version not recorded  
**Reference:** [Pdf.js and react-pdf upgrade](https://github.com/TeXlyre/texlyre/commit/5182303fd761a2f1ce3ff5115143d0cc5a632d3f)  
**Assistance:** Diagnosis of errors following library and API changes, including React, Vite, and Pdf.js updates.  
**Interaction summary:** Errors, affected code, dependency changes, and relevant upstream documentation were supplied for analysis.  
**Output:** Debugging suggestions and targeted fixes.  
**Review:** Fixes were checked against documentation, builds, and application behaviour.

## Maintenance and refactoring

### UI and stylesheet cleanup

**Tool:** Anthropic Claude Opus 4.8, Claude Opus 5, OpenAI GPT-5.5, OpenAI GPT-5.6  
**Period:** 2026  
**Reference:** [prerelease style cleanup](https://github.com/TeXlyre/texlyre/commit/02030436bce998c4e72053c08bd69fd92cfc007e)  
**Assistance:** CSS regression analysis, selector tracing, consolidation of repeated styles, and cleanup after UI refactors.  
**Interaction summary:** Current styles/components and the visual regression were supplied, often together with an earlier working version. Requests focused on preserving the existing layout while reducing redundant rules.  
**Output:** CSS edits and small component changes.  
**Review:** Changes were checked across the affected TeXlyre layouts and components.

### Editor and renderer regressions

**Tool:** Claude Opus 4.8, OpenAI GPT-5.6  
**Period:** 2026  
**References:** [PDF renderer scrolling fix](https://github.com/TeXlyre/texlyre/commit/f1f66aaf89a8c064a574c49071fb90c517909d47), [source-map path fix](https://github.com/TeXlyre/texlyre/commit/1ee640d78262838fd18ff4a48bc1179161afdfd0)  
**Assistance:** Diagnosis of editor highlighting, renderer scrolling, source-map navigation, and layout regressions.  
**Interaction summary:** Relevant source, observed behaviour, and affected renderer/editor state were supplied. Requests focused on locating the competing rule or state update and applying a local correction. Renderer regressions included interactions between source-map highlighting, scrolling, zoom, and loaded pages. Editor regressions included CodeMirror extension compartments and LSP interaction with Lezer-based languages.  
**Output:** Targeted TypeScript/React or CSS changes.  
**Review:** Changes were checked in the affected editor/renderer flow and against related behaviour.

### Git, history, review, and merge maintenance

**Tool:** OpenAI GPT-5.6  
**Period:** 2026  
**Reference:** [annotation preservation during Git merge](https://github.com/TeXlyre/texlyre/commit/9e2e3322041b776fd8826323b3cd054e19d3b87e)  
**Assistance:** Review and debugging of repository selection, branch handling, history UI, merge behaviour, annotations, and related tests.  
**Interaction summary:** Current implementation and failing or unexpected behaviour were supplied. Requests focused on preserving existing Git behaviour while correcting the affected path.  
**Output:** Local service/component changes and test updates.  
**Review:** Changes were checked with the affected tests and related Git workflows.

### LSP API refactoring and extension

**Tool:** OpenAI GPT-5.6  
**Period:** 2026  
**Reference:** [PR #380: Refactored and extended LSP support](https://github.com/TeXlyre/texlyre/pull/380), including [LSP protocol core extraction](https://github.com/TeXlyre/texlyre/commit/b51e9e70b0a17c6a17b0a6098f5855f00295dd3c) and [feature module integration](https://github.com/TeXlyre/texlyre/commit/b629b31054cbecfd248d1f6a0d2bbb4f8b2709d6)  
**Assistance:** Refactoring and extension of the CodeMirror LSP implementation into separate protocol and feature modules.  
**Interaction summary:** Existing LSP code and behaviour were supplied with requests to separate responsibilities while preserving provider compatibility and existing editor behaviour. Work covered diagnostics, document synchronisation, completion, hover, navigation, document symbols, code actions, document highlights, semantic tokens, and signature help.  
**Output:** TypeScript refactoring and feature-module changes.  
**Review:** Changes were checked against existing LSP providers, editor behaviour, and affected tests.

### TextMate grammar support

**Tool:** OpenAI GPT-5.6  
**Period:** 2026  
**Reference:** [PR #355: Added support for Textmate grammars](https://github.com/TeXlyre/texlyre/pull/355), anchored by [TextMate grammar and completion support](https://github.com/TeXlyre/texlyre/commit/7ba80db565c4eb1fe40454908e611fbeda6e66d2)  
**Assistance:** Integration and review of TextMate grammar support for languages without dedicated CodeMirror language packages.  
**Interaction summary:** Existing language registration and CodeMirror integration were supplied together with the required TextMate grammar behaviour. Work covered grammar loading, Oniguruma/TextMate integration, generated grammar manifests, completion, and language registration.  
**Output:** TypeScript, build-script, configuration, and dependency changes.  
**Review:** Grammar loading, highlighting, completion, and supported language behaviour were checked in the editor.

### Service and component refactoring

**Tool:** OpenAI GPT-5.6  
**Period:** 2026  
**Reference:** [service and UI separation refactor](https://github.com/TeXlyre/texlyre/commit/3324c3e0b0276701ee3a5f22be05694cd46c6b7f)  
**Assistance:** Review of existing components and services for duplicated logic, unnecessary state, effects, listeners, and clearer separation of responsibilities.  
**Interaction summary:** Existing implementations were supplied with explicit constraints on behaviour and scope.  
**Output:** Refactoring patches to existing code.  
**Review:** Tests, builds, and manual behaviour checks were used according to the affected subsystem.
