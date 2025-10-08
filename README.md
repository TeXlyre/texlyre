# TeXlyre

A **[local-first](https://www.inkandswitch.com/essay/local-first/)** real-time [LaTeX](https://www.latex-project.org/) and [Typst](https://typst.app) collaboration platform with offline editing capabilities. Built with React, TypeScript, and Yjs for collaborative document editing.

[![GitHub Pages](https://img.shields.io/badge/🟢%20Live-GitHub%20Pages-181717.svg?logo=github)](https://texlyre.github.io/texlyre)
[![Tests](https://img.shields.io/github/actions/workflow/status/texlyre/texlyre/test.yml?label=tests)](https://github.com/texlyre/texlyre/actions)
[![Deploy](https://img.shields.io/github/actions/workflow/status/texlyre/texlyre/deploy.yml?label=deploy)](https://github.com/texlyre/texlyre/actions)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)

![Main editor interface showing split view with LaTeX code on left, compiled PDF on right](showcase/main_showcase_dark.png)

## Features

### Real-time Collaboration

TeXlyre enables multi-user editing with live cursors and selections visible across all connected clients. The platform uses **[Yjs](https://github.com/yjs/yjs) CRDTs** for conflict-free synchronization, ensuring that changes from multiple users are automatically merged without conflicts. Communication happens through **WebRTC** peer-to-peer connections, providing low-latency collaboration without requiring a central server. An integrated chat system allows collaborators to communicate directly within the editing environment.

<p align="center">
<img src="showcase/collab_cursor_zoomed.png" alt="Multiple users editing simultaneously with different colored cursors" >
</p>

TeXlyre provides comment and chat features for real-time exchanges, reviews, and discussions among collaborators.

<p align="center">
<img src="showcase/chat_zoomed.png" alt="Collaborators using the chat panel to discuss progress">
</p>

### LaTeX Compilation

The platform integrates **[SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX) WASM engines** to provide in-browser LaTeX compilation without server dependencies. Currently supports **pdfTeX** and **XeTeX** engines for document processing. TeXlyre supports real-time syntax highlighting and error detection, with an integrated PDF viewer that offers zoom, navigation, and side-by-side editing capabilities.

<p align="center">
<img src="showcase/error_parser_zoomed_latex.png" alt="LaTeX compilation in progress with error panel and PDF output" width="600">
</p>

### Typst Compilation

The platform integrates **[typst.ts](https://github.com/Myriad-Dreamin/typst.ts)** to provide in-browser [Typst](https://github.com/typst/typst) compilation without server dependencies. Currently supports PDF, SVG, and canvas compilation, however, SVG and HTML compilation are experimental, and are not guaranteed to work as expected at the time being.  

<p align="center">
<img src="showcase/error_parser_zoomed_typst.png" alt="Typst compilation in progress" width="600">
</p>

**Coming soon: Real-time compilation as you type**

### Local-first Architecture

TeXlyre prioritizes data ownership and offline capability. All documents are stored locally using **IndexedDB**, enabling full offline editing with automatic synchronization when connectivity returns. The File System Access API provides direct folder synchronization for external backup solutions, while project export and import features ensure complete data portability across devices and installations.

### File Management and Synchronization

The platform includes a file explorer supporting drag-and-drop operations for various file types including LaTeX sources, Typst sources, images, and data files. **Document linking** creates connections between collaborative documents and static files, enabling seamless editing workflows. **[FilePizza](https://github.com/kern/filepizza) integration** provides secure peer-to-peer file sharing between collaborators, allowing large file transfers without intermediary servers.

![Project dashboard with file explorer and project cards](showcase/project_viewer_zoomed.png)

## Quick Start

Installation requires Node.js 20+ and a modern browser with File System Access API support:

```bash
git clone https://github.com/TeXlyre/texlyre.git
cd texlyre
npm install
npm run start
```

Navigate to `http://localhost:4173` to access the application. Create a new project to begin editing, or open an existing project by sharing its URL with collaborators. The URL format `http://localhost:4173/#yjs:abc123def456` enables instant collaboration access.

Moreover, you can start your project from a template and share the link with your collaborators.

<p align="center">
<img src="showcase/templates_zoomed.png" alt="Getting started with a template">
</p>

```bash
npm install
npm run start
```

For detailed installation instructions, advanced configuration, and development workflows, see the [installation documentation](https://texlyre.github.io/docs/installation). 

For configuring TeXlyre's theme, properties, and supported plugins, see the [configuration documentation](https://texlyre.github.io/docs/configuration#configuration-files). 

## Architecture

TeXlyre's architecture emphasizes **local-first principles** while enabling real-time collaboration. The React frontend communicates with Yjs documents stored in IndexedDB, providing offline-first functionality. WebRTC establishes direct peer connections for real-time synchronization, while **[SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX) WASM engines** and **[typst.ts](https://github.com/Myriad-Dreamin/typst.ts)** handle LaTeX and Typst compilation entirely in the browser.

The **plugin system** allows extensibility through custom viewers, renderers, and backup providers. Core plugins handle PDF rendering, LaTeX and Typst log visualization, and file system backup operations. Theme plugins provide customizable layouts and visual styles.

![Bib Editor plugin integrated into the TeXlyre app](showcase/bib_editor_zoomed.png)

## File Synchronization

### Local File System

The File System Access API enables direct synchronization with local folders, supporting cross-device workflows through cloud storage providers like Dropbox or Google Drive. Users can connect TeXlyre projects to existing file system structures, maintaining compatibility with traditional LaTeX and Typst workflows.

### Peer-to-peer Sharing

**[FilePizza](https://github.com/kern/filepizza) integration** facilitates secure file sharing between collaborators over WebRTC. Large files, images, and other non-collaborative text files can be transferred directly between browsers, maintaining privacy and reducing dependency on external services. This protocol, although completely independent of the Yjs WebRTC connection, still uses Yjs to manage file metadata and synchronization state, ensuring that all collaborators have access to the latest versions of shared files. Yjs facilitates real-time collaboration (e.g., live updates to file lists, shared metadata, cursor tracking, real-time document editing) while FilePizza handles the file transfer of non-collaborative files.

## Plugin Development

The plugin architecture supports custom functionality through typed interfaces:

```typescript
interface ViewerPlugin extends Plugin {
  type: 'viewer';
  canHandle: (fileType: string, mimeType?: string) => boolean;
  renderViewer: React.ComponentType<ViewerProps>;
}
```

Plugins can extend TeXlyre with custom file viewers, LaTeX/Typst log processors, backup providers, and theme variations (including a mobile theme). The plugin registry automatically discovers and loads compatible plugins during application initialization.

Once a plugin is developed, it can be registered in the `plugins.config.ts` by simply adding its path (excluding the '/extras' prefix). All plugins must be placed in the 'extras' directory to be recognized by the system. 

Configuration may be overriden by the `texlyre.config.ts` depending on your installation. **ALWAYS** set the plugin path as well in `texlyre.config.ts` for guaranteed persistence of the config (see the [configuration documentation](https://texlyre.github.io/docs/configuration#configuration-files))

## Browser Compatibility

TeXlyre requires modern browser features for optimal functionality. **Chrome and Edge** provide full feature support including File System Access API and WebRTC. **Firefox** supports core collaboration features but has limited file system integration. **Safari** offers partial compatibility with reduced file system access capabilities. The File System API was not thoroughly tested with mobile device browsers; therefore, use the file system backup feature on TeXlyre with caution.

WebRTC support is required for real-time collaboration, while the File System Access API enables backup and synchronization features in supported browsers.

## License

TeXlyre is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

This means:
- ✅ You can use, modify, and distribute this software
- ✅ You can run it for any purpose, including commercial use
- ⚖️ If you distribute modified versions, you must also distribute the source code
- ⚖️ If you run a modified version as a network service, you must provide source code to users

See [LICENSE](LICENSE) for the complete license text.

### Why AGPL-3.0?

TeXlyre is licensed under AGPL-3.0 due to our dependency on [SwiftLaTeX's AGPL-licensed LaTeX engine (WASM)](https://github.com/SwiftLaTeX/SwiftLaTeX/) for in-browser LaTeX compilation.

## Privacy & Data

TeXlyre is privacy-focused by design:

- **Local-first**: All your data stays in your browser
- **Direct connections**: Peer-to-peer collaboration without server intermediaries  
- **No tracking**: No analytics, cookies, or data collection

When you collaborate, IP addresses are temporarily processed through signaling servers to establish direct connections. No project content is transmitted through our servers.

### GitHub Integration
The optional GitHub integration only activates when you explicitly enable it and provide your own GitHub token.

## Infrastructure

TeXlyre uses open source signaling servers for WebRTC connections:

- **Y-WebRTC Signaling**: Based on [y-webrtc](https://github.com/yjs/y-webrtc)
- **PeerJS Signaling**: Based on [PeerJS Server](https://github.com/peers/peerjs-server)
- **TeX Live Download Server**: Based on [SwiftLaTeX Texlive On-Demand Server](https://github.com/SwiftLaTeX/Texlive-Ondemand)
- **FilePizza Server**: Based on [FilePizza](https://github.com/kern/filepizza) which relies on PeerJS (built-in TURN servers are not deployed on TeXlyre servers)

All servers are hosted locally and made publicly available with [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

### Self-Hosting

You can run your own signaling servers by following the setup instructions in our [infrastructure repository](https://github.com/texlyre/texlyre-infrastructure).

## Acknowledgments

TeXlyre builds upon several key technologies: **[SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX)** provides WASM-based LaTeX compilation, **[typst.ts](https://github.com/Myriad-Dreamin/typst.ts)** provides WASM-based Typst compilation, **[Yjs](https://github.com/yjs/yjs)** enables conflict-free collaborative editing, **[CodeMirror](https://codemirror.net/)** powers the text editing interface, and **[FilePizza](https://github.com/kern/filepizza)** facilitates secure peer-to-peer file transfers.

Development of TeXlyre was assisted by **Anthropic Claude** for code generation, debugging, and architectural guidance.

---

**Ready to start collaborating?** [Get started with TeXlyre](https://texlyre.github.io/texlyre/) or [contribute to the project](CONTRIBUTING.md).
