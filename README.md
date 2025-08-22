# TeXlyre

A **[local-first](https://www.inkandswitch.com/essay/local-first/)** real-time LaTeX collaboration platform with offline editing capabilities. Built with React, TypeScript, and Yjs for collaborative document editing.

[![GitHub Pages](https://img.shields.io/badge/🟢%20Live-GitHub%20Pages-181717.svg?logo=github)](https://texlyre.github.io/texlyre)
[![Build Status](https://img.shields.io/github/actions/workflow/status/texlyre/texlyre/deploy.yml)](https://github.com/texlyre/texlyre/actions)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)

![Main editor interface showing split view with LaTeX code on left, compiled PDF on right](showcase/tikz_compile.png)

## Features

### Real-time Collaboration

TeXlyre enables multi-user editing with live cursors and selections visible across all connected clients. The platform uses **Yjs CRDTs** for conflict-free synchronization, ensuring that changes from multiple users are automatically merged without conflicts. Communication happens through **WebRTC** peer-to-peer connections, providing low-latency collaboration without requiring a central server. An integrated chat system allows collaborators to communicate directly within the editing environment.

![Multiple users editing simultaneously with different colored cursors](showcase/collab_cursor_zoomed.png)

TeXlyre provides comment and chat features as well for real-time exchanges, reviews, and discussions among collaborators

![Collaborators using the chat panel to discuss progress](showcase/chat_zoomed.png)

### LaTeX Compilation

The platform integrates **SwiftLaTeX WASM engines** to provide in-browser LaTeX compilation without server dependencies. Currently supports **pdfTeX** and **XeTeX** engines for comprehensive document processing. Live compilation provides immediate feedback with syntax highlighting and error detection, while the integrated PDF viewer offers zoom, navigation, and side-by-side editing capabilities.

![LaTeX compilation in progress with error panel and PDF output](showcase/error_parser_zoomed.png)

### Local-first Architecture

TeXlyre prioritizes data ownership and offline capability. All documents are stored locally using **IndexedDB**, enabling full offline editing with automatic synchronization when connectivity returns. The File System Access API provides direct folder synchronization for external backup solutions, while project export and import features ensure complete data portability across devices and installations.

### File Management and Synchronization

The platform includes a comprehensive file explorer supporting drag-and-drop operations for various file types including LaTeX sources, images, and data files. **Document linking** creates connections between collaborative documents and static files, enabling seamless editing workflows. **FilePizza integration** provides secure peer-to-peer file sharing between collaborators, allowing large file transfers without intermediary servers.

![Project dashboard with file explorer and project cards](showcase/project_viewer_zoomed.png)

## Quick Start

Installation requires Node.js 18+ and a modern browser with File System Access API support:

```bash
git clone https://github.com/TeXlyre/texlyre.git
cd texlyre
npm install
npm run dev
```

Navigate to `http://localhost:5173` to access the application. Create a new project to begin editing, or open an existing project by sharing its URL with collaborators. The URL format `http://localhost:5173/#yjs:abc123def456` enables instant collaboration access.

Moreover, you can start your project from a template and share the link with your collaborators.

![Getting started with a template](showcase/templates_zoomed.png)

## Architecture

TeXlyre's architecture emphasizes **local-first principles** while enabling real-time collaboration. The React frontend communicates with Yjs documents stored in IndexedDB, providing offline-first functionality. WebRTC establishes direct peer connections for real-time synchronization, while SwiftLaTeX WASM engines handle LaTeX compilation entirely in the browser.

The **plugin system** allows extensibility through custom viewers, renderers, and backup providers. Core plugins handle PDF rendering, LaTeX log visualization, and file system backup operations. Theme plugins provide customizable layouts and visual styles.

![Bib Editor plugin integrated in to the TeXlyre app](showcase/bib_editor_zoomed.png)
## File Synchronization

### Local File System

The File System Access API enables direct synchronization with local folders, supporting cross-device workflows through cloud storage providers like Dropbox or Google Drive. Users can connect TeXlyre projects to existing file system structures, maintaining compatibility with traditional LaTeX workflows.

### Peer-to-peer Sharing

FilePizza integration facilitates secure file sharing between collaborators over WebRTC. Large files, images, and other non-collaborative text files can be transferred directly between browsers, maintaining privacy and reducing dependency on external services. 
This protocol, although completely independent of the Yjs WebRTC connection, we stilluse Yjs to manage file metadata and synchronization state, ensuring that all collaborators have access to the latest versions of shared files.
Yjs facilities facilitates real-time collaboration (e.g., live updates to file lists, shared metadata, cursor tracking, real-time document editing) while FilePizza handles the file transfer of non-collaborative files.

## Development

### Building and Development

```bash
npm install            # Install npm packages
npm run dev            # Development server with hot reload
npm run dev:https      # Development HTTPS server with hot reload
npm run build          # Production build optimization
npm run preview        # Local preview of production build
npm run lint           # ESLint code quality checks
```

### Plugin Development

The plugin architecture supports custom functionality through typed interfaces:

```typescript
interface ViewerPlugin extends Plugin {
  type: 'viewer';
  canHandle: (fileType: string, mimeType?: string) => boolean;
  renderViewer: React.ComponentType<ViewerProps>;
}
```

Plugins can extend TeXlyre with custom file viewers, LaTeX log processors, backup providers, and theme variations. The plugin registry automatically discovers and loads compatible plugins during application initialization.

Once a plugin is developed, it can be registered in the `plugins.config.ts` by simply adding its path (excluding the '/extras' prefix). All plugins must be placed in the 'extras' directory to be recognized by the system.



## Browser Compatibility

TeXlyre requires modern browser features for optimal functionality. **Chrome and Edge** provide full feature support including File System Access API and WebRTC. 
**Firefox** supports core collaboration features but has limited file system integration. **Safari** offers partial compatibility with reduced file system access capabilities.
The File System API was not thoroughly tested with the mobile device browsers, therefore, use the file system backup feature on TeXlyre with caution.

WebRTC support is essential for real-time collaboration, while the File System Access API enables advanced backup and synchronization features in supported browsers.

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

All servers are hosted locally an made publicly available with [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

### Self-Hosting
You can run your own signaling servers by following the setup instructions in our [infrastructure repository](https://github.com/texlyre/texlyre-infrastructure).




## Acknowledgments

TeXlyre builds upon several key technologies: **SwiftLaTeX** provides WASM-based LaTeX compilation, **Yjs** enables conflict-free collaborative editing, **CodeMirror** powers the advanced text editing interface, and **FilePizza** facilitates secure peer-to-peer file transfers.

Development of TeXlyre was assisted by **Anthropic Claude** for code generation, debugging, and architectural guidance.

---

**Ready to start collaborating?** [Get started with TeXlyre](https://texlyre.github.io/texlyre/) or [contribute to the project](CONTRIBUTING.md).
