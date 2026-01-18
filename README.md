# React Component Source Highlighter

A Chrome extension that highlights React components on any webpage and displays their component names and source file locations.

## Features

- **Component Highlighting**: Hover over any element to see React components with colored bounding boxes
- **Component Name Display**: Shows the component name (including ForwardRef, Memo, etc.)
- **Source File Information**: Displays the source file and line number when available (requires development builds)
- **Nesting Level Control**: Adjust how many levels of parent components to display (1-10)
- **Tree Type Selection**: Choose between React component tree or DOM tree traversal
- **Multi-colored Overlays**: Each nesting level has a distinct color for easy identification

## How It Works

The extension hooks into React's internal fiber tree using the same mechanism as React DevTools (`__REACT_DEVTOOLS_GLOBAL_HOOK__`). It:

1. Injects a script that installs or piggybacks on the React DevTools global hook
2. Captures fiber root commits to track React components
3. On hover, traverses the fiber tree to find parent React components
4. Renders overlay boxes with component information

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chrome-extension-react-component-source-highlighter.git
   cd chrome-extension-react-component-source-highlighter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Generate icons (required):
   ```bash
   # Option 1: Use the generate script
   node scripts/generate-icons.js

   # Option 2: Manually convert icon.svg to PNG
   # Use any SVG to PNG converter for 16x16, 48x48, and 128x128 sizes
   ```

4. Build the extension:
   ```bash
   npm run build
   ```

5. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Development

For development with auto-rebuild:

```bash
npm run dev
```

## Usage

1. Click the extension icon in Chrome toolbar
2. Toggle "Enable Highlighting" to activate
3. Hover over elements on any React webpage
4. See component names and source files in the overlay labels

### Controls

- **Enable Highlighting**: Turn component highlighting on/off
- **Nesting Levels**: How many parent components to show (1-10)
- **Tree Type**:
  - **React Tree**: Follows React's component hierarchy
  - **DOM Tree**: Follows the HTML DOM structure

## Source File Information

Source file and line number information is only available when:

1. The React app is built in **development mode**
2. The build includes `_debugSource` information (enabled by default in development)
3. You're using a modern bundler (Webpack, Vite, etc.) with source maps

Production builds typically strip this information for performance and security.

## Technical Details

### React Fiber Integration

The extension uses React's internal fiber tree structure:

- **FiberNode**: React's internal representation of components
- **`_debugSource`**: Contains fileName and lineNumber (development only)
- **Fiber tags**: Used to identify component types (Function, Class, ForwardRef, etc.)

### Supported Component Types

- Function Components
- Class Components
- ForwardRef Components
- Memo Components
- Context Providers/Consumers
- Suspense Components
- Fragments

### Browser Compatibility

- Chrome 88+ (Manifest V3)
- Edge 88+ (Chromium-based)

## Limitations

- Source file information requires development builds of React apps
- Works best with React 16.8+ (hooks-based apps)
- Some minified production builds may show "Anonymous" for component names
- iframes are supported but may have limitations based on cross-origin policies

## Project Structure

```
├── manifest.json          # Chrome extension manifest
├── src/
│   ├── background.ts      # Service worker for state management
│   ├── content.ts         # Content script bridge
│   ├── injected.ts        # Main script with fiber tree access
│   └── popup/
│       ├── popup.html     # Extension popup UI
│       ├── popup.css      # Popup styles
│       └── popup.ts       # Popup controller
├── icons/
│   └── icon.svg           # Source icon (convert to PNG)
├── scripts/
│   └── generate-icons.js  # Icon generation script
├── webpack.config.js      # Build configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Acknowledgments

- Inspired by [React DevTools](https://github.com/facebook/react/tree/main/packages/react-devtools)
- Uses React's fiber tree architecture for component inspection
