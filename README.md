# Obsidian Terminal Sidebar

A powerful terminal plugin for Obsidian that integrates a fully functional terminal directly into your sidebar.

## Features

- **Integrated Terminal**: A real terminal embedded in Obsidian's sidebar using xterm.js and node-pty
- **Customizable**: Configure shell, font size, and cursor behavior
- **Responsive**: Automatically resizes to fit the sidebar
- **Easy Access**: Open via ribbon icon or command palette
- **Full Terminal Support**: All terminal features including colors, cursor movement, and keyboard shortcuts

## Installation

### Manual Installation

1. Download the latest release files: `main.js`, `styles.css`, and `manifest.json`
2. Create a folder named `obsidian-terminal-sidebar` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into this folder
4. Reload Obsidian
5. Enable "Terminal Sidebar" in Settings → Community plugins

### Development Installation

1. Clone this repository into your vault's `.obsidian/plugins/` folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone https://github.com/yourusername/obsidian-terminal-sidebar.git
   cd obsidian-terminal-sidebar
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

   Or run in development mode with auto-rebuild:
   ```bash
   npm run dev
   ```

4. Reload Obsidian and enable the plugin in Settings

## Usage

### Opening the Terminal

- Click the terminal icon in the left ribbon
- Or use the command palette (Ctrl/Cmd + P) and search for "Open Terminal"

The terminal will open in the right sidebar and provides a full-featured terminal experience.

### Settings

Access plugin settings via Settings → Terminal Sidebar:

- **Shell**: Path to your preferred shell (defaults to system shell)
- **Font Size**: Adjust terminal font size in pixels (default: 14)
- **Cursor Blink**: Enable or disable cursor blinking

## Technical Details

This plugin uses:
- **xterm.js**: Terminal emulator for the web
- **node-pty**: Provides real pseudoterminal functionality
- **Obsidian Plugin API**: For seamless integration with Obsidian

## Requirements

- Obsidian v0.15.0 or higher
- Node.js v16 or higher (for development)

## Development

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint (optional)
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code. 
- To use eslint with this project, make sure to install eslint from terminal:
  - `npm install -g eslint`
- To use eslint to analyze this project use this command:
  - `eslint main.ts`
  - eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
  - `eslint ./src/`

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API Documentation

See https://github.com/obsidianmd/obsidian-api
