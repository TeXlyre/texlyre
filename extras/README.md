# TeXlyre Plugin System

This directory contains plugins for the TeXlyre editor. The plugin system allows for extending TeXlyre functionality without modifying the core codebase.

## Plugin Types

Currently supported plugin types:

- **Viewers**: Plugins that can display various file types in the editor area
  - Example: Image viewer for viewing image files

## Directory Structure

```
extras/
├── index.ts                  # Auto-generated export file for all plugins
├── viewers/                  # Directory for viewer plugins
│   ├── image/                # Image viewer plugin
│   │   ├── ImageViewer.tsx   # React component for viewing images
│   │   ├── ImageViewerPlugin.ts  # Plugin interface implementation
│   │   ├── index.ts          # Exports the plugin
│   │   └── styles.css        # Styles for the image viewer
│   └── ... (other viewer plugins)
├── ... (other plugin types)
```

## Creating a New Plugin

### 1. Viewer Plugin

To create a new viewer plugin:

1. Create a new directory in `extras/viewers/`
2. Implement the plugin interface by creating a file like `MyViewerPlugin.ts`:

```typescript
// MyViewerPlugin.ts
import { ViewerPlugin } from '../../../src/plugins/PluginInterface';
import MyViewer from './MyViewer';

const myViewerPlugin: ViewerPlugin = {
  id: 'texlyre-my-viewer',
  name: 'My Viewer',
  version: '1.0.0',
  type: 'viewer',
  
  canHandle: (fileName: string, mimeType?: string): boolean => {
    // Logic to determine if this plugin can handle the file
    return true;
  },
  
  renderViewer: MyViewer
};

export default myViewerPlugin;
```

3. Create a viewer component:

```typescript
// MyViewer.tsx
import React from 'react';
import { ViewerProps } from '../../../src/plugins/PluginInterface';

const MyViewer: React.FC<ViewerProps> = ({ content, mimeType, fileName }) => {
  // Component implementation
  return (
    <div>
      {/* Viewer implementation */}
    </div>
  );
};

export default MyViewer;
```

4. Create an `index.ts` file in your plugin directory:

```typescript
// extras/viewers/my-viewer/index.ts
import MyViewerPlugin from './MyViewerPlugin';

export default MyViewerPlugin;
```

5. Add your plugin to the `plugins.config.js` file in the project root:

```javascript
// plugins.config.js
export default {
  plugins: [
    'viewers/image',
    'viewers/my-viewer'
    // Add other plugins here
  ]
};
```

6. Run the plugin build script to generate the plugin index:

```bash
npm run generate-plugins
# OR simply run the project
npm run dev
```