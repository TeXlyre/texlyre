# TeXlyre

A **local-first** real-time LaTeX collaboration platform with offline editing capabilities. Built with React, TypeScript, and Yjs for collaborative document editing.

[![License: MIT](https://img.shields.io/badge/License-AGPL-yellow.svg)](https://opensource.org/licenses/AGPL-3.0)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)

*[Screenshot placeholder: Main editor interface showing split view with LaTeX code on left, compiled PDF on right]*

## Features

### Real-time Collaboration

TeXlyre enables multi-user editing with live cursors and selections visible across all connected clients. The platform uses **Yjs CRDTs** for conflict-free synchronization, ensuring that changes from multiple users are automatically merged without conflicts. Communication happens through **WebRTC** peer-to-peer connections, providing low-latency collaboration without requiring a central server. An integrated chat system allows collaborators to communicate directly within the editing environment.

*[Screenshot placeholder: Multiple users editing simultaneously with different colored cursors]*

### LaTeX Compilation

The platform integrates **SwiftLaTeX WASM engines** to provide in-browser LaTeX compilation without server dependencies. Currently supports **pdfTeX** and **XeTeX** engines for comprehensive document processing. Live compilation provides immediate feedback with syntax highlighting and error detection, while the integrated PDF viewer offers zoom, navigation, and side-by-side editing capabilities.

*[Screenshot placeholder: LaTeX compilation in progress with error panel and PDF output]*

### Local-first Architecture

TeXlyre prioritizes data ownership and offline capability. All documents are stored locally using **IndexedDB**, enabling full offline editing with automatic synchronization when connectivity returns. The File System Access API provides direct folder synchronization for external backup solutions, while project export and import features ensure complete data portability across devices and installations.

### File Management and Synchronization

The platform includes a comprehensive file explorer supporting drag-and-drop operations for various file types including LaTeX sources, images, and data files. **Document linking** creates connections between collaborative documents and static files, enabling seamless editing workflows. **FilePizza integration** provides secure peer-to-peer file sharing between collaborators, allowing large file transfers without intermediary servers.

*[Screenshot placeholder: Project dashboard with file explorer and project cards]*

## Quick Start

Installation requires Node.js 16+ and a modern browser with File System Access API support:

```bash
git clone https://github.com/fabawi/texlyre.git
cd texlyre
npm install
npm run dev
```

Navigate to `http://localhost:5173` to access the application. Create a new project to begin editing, or open an existing project by sharing its URL with collaborators. The URL format `http://localhost:5173/#yjs:abc123def456` enables instant collaboration access.

*[Screenshot placeholder: Getting started flow showing project creation and first document]*

## Architecture

TeXlyre's architecture emphasizes **local-first principles** while enabling real-time collaboration. The React frontend communicates with Yjs documents stored in IndexedDB, providing offline-first functionality. WebRTC establishes direct peer connections for real-time synchronization, while SwiftLaTeX WASM engines handle LaTeX compilation entirely in the browser.

The **plugin system** allows extensibility through custom viewers, renderers, and backup providers. Core plugins handle PDF rendering, LaTeX log visualization, and file system backup operations. Theme plugins provide customizable layouts and visual styles.

## File Synchronization

### Local File System

The File System Access API enables direct synchronization with local folders, supporting cross-device workflows through cloud storage providers like Dropbox or Google Drive. Users can connect TeXlyre projects to existing file system structures, maintaining compatibility with traditional LaTeX workflows.

### Peer-to-peer Sharing

FilePizza integration facilitates secure file sharing between collaborators over WebRTC. Large files, images, and other non-collaborative text files can be transferred directly between browsers, maintaining privacy and reducing dependency on external services. 
This protocol although completely independent of the Yjs WebRTC connection, TeXlyre still uses Yjs to manage file metadata and synchronization state, ensuring that all collaborators have access to the latest versions of shared files.
Yjs facilities facilitates real-time collaboration (e.g., live updates to file lists, shared metadata, cursor tracking, real-time document editing) while FilePizza handles the file transfer of non-collaborative files.

## Development

### Building and Development

```bash
npm run dev      # Development server with hot reload
npm run build    # Production build optimization
npm run preview  # Local preview of production build
npm run lint     # ESLint code quality checks
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

TeXlyre requires modern browser features for optimal functionality. **Chrome and Edge** provide full feature support including File System Access API and WebRTC. **Firefox** supports core collaboration features but has limited file system integration. **Safari** offers partial compatibility with reduced file system access capabilities.

WebRTC support is essential for real-time collaboration, while the File System Access API enables advanced backup and synchronization features in supported browsers.

## License

TexLyre is licensed under the GNU Affero General Public License v3.0. This means you can use, modify, and distribute the software freely, but any derivative works must also be open-sourced under the same license - see [LICENSE](LICENSE) file for details.

## Acknowledgments

TeXlyre builds upon several key technologies: **SwiftLaTeX** provides WASM-based LaTeX compilation, **Yjs** enables conflict-free collaborative editing, **CodeMirror** powers the advanced text editing interface, and **FilePizza** facilitates secure peer-to-peer file transfers.

---

**Ready to start collaborating?** [Get started with TeXlyre](https://texlyre.github.io/texlyre/) or [contribute to the project](CONTRIBUTING.md).