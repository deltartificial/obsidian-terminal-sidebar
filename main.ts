import { App, ItemView, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { exec, spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';

const VIEW_TYPE_TERMINAL = 'terminal-view';

interface TerminalPluginSettings {
	shell: string;
	fontSize: number;
	cursorBlink: boolean;
}

const DEFAULT_SETTINGS: TerminalPluginSettings = {
	shell: os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash',
	fontSize: 14,
	cursorBlink: true
}

export default class TerminalPlugin extends Plugin {
	settings: TerminalPluginSettings;

	async onload() {
		await this.loadSettings();

		// Register the terminal view
		this.registerView(
			VIEW_TYPE_TERMINAL,
			(leaf) => new TerminalView(leaf, this.settings)
		);

		// Add command to open terminal
		this.addCommand({
			id: 'open-terminal-view',
			name: 'Open Terminal',
			callback: () => {
				this.activateView();
			}
		});

		// Add settings tab
		this.addSettingTab(new TerminalSettingTab(this.app, this));

		// Automatically add terminal icon to right sidebar on startup
		this.app.workspace.onLayoutReady(() => {
			this.initTerminalView();
		});
	}

	private initTerminalView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);

		// Only create if it doesn't exist
		if (leaves.length === 0) {
			this.app.workspace.getRightLeaf(false)?.setViewState({
				type: VIEW_TYPE_TERMINAL,
				active: false,
			});
		}
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);

		if (leaves.length > 0) {
			// A terminal view already exists, use it
			leaf = leaves[0];
		} else {
			// Create new terminal view in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: VIEW_TYPE_TERMINAL,
					active: true,
				});
			}
		}

		// Reveal the leaf
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TerminalView extends ItemView {
	private terminal: Terminal;
	private fitAddon: FitAddon;
	private shellProcess: ChildProcess | null = null;
	private settings: TerminalPluginSettings;
	private currentLine: string = '';
	private cwd: string;

	constructor(leaf: WorkspaceLeaf, settings: TerminalPluginSettings) {
		super(leaf);
		this.settings = settings;
		this.cwd = process.env.HOME || process.env.USERPROFILE || os.homedir();
	}

	getViewType(): string {
		return VIEW_TYPE_TERMINAL;
	}

	getDisplayText(): string {
		return 'Terminal';
	}

	getIcon(): string {
		return 'terminal';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('terminal-container');

		// Create terminal element
		const terminalEl = container.createDiv({ cls: 'terminal-wrapper' });

		// Get the background color from CSS variable
		const bgColor = getComputedStyle(document.body).getPropertyValue('--background-secondary').trim() || '#202020';
		const fgColor = getComputedStyle(document.body).getPropertyValue('--text-normal').trim() || '#cccccc';

		// Initialize xterm.js
		this.terminal = new Terminal({
			cursorBlink: this.settings.cursorBlink,
			fontSize: this.settings.fontSize,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: bgColor,
				foreground: fgColor,
			},
			convertEol: true
		});

		// Add fit addon
		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);

		// Open terminal in DOM
		this.terminal.open(terminalEl);

		// Fit terminal to container
		this.fitAddon.fit();

		// Write prompt directly without welcome message
		this.writePrompt(false);

		// Handle terminal input
		this.terminal.onData((data: string) => {
			this.handleInput(data);
		});

		// Handle window resize
		const resizeObserver = new ResizeObserver(() => {
			this.fitAddon.fit();
		});
		resizeObserver.observe(terminalEl);

		// Clean up on close
		this.register(() => {
			resizeObserver.disconnect();
		});

		// Add CSS for terminal
		this.addStyles();
	}

	private writePrompt(newLine: boolean = true) {
		const prompt = `${newLine ? '\r\n' : ''}\x1b[32m${this.cwd}\x1b[0m $ `;
		this.terminal.write(prompt);
	}

	private handleInput(data: string) {
		const code = data.charCodeAt(0);

		// Handle special keys
		if (code === 13) { // Enter
			this.terminal.write('\r\n');
			if (this.currentLine.trim()) {
				this.executeCommand(this.currentLine.trim());
			} else {
				this.writePrompt();
			}
			this.currentLine = '';
		} else if (code === 127) { // Backspace
			if (this.currentLine.length > 0) {
				this.currentLine = this.currentLine.slice(0, -1);
				this.terminal.write('\b \b');
			}
		} else if (code === 3) { // Ctrl+C
			this.terminal.write('^C\r\n');
			this.currentLine = '';
			this.writePrompt();
		} else if (code >= 32) { // Printable characters
			this.currentLine += data;
			this.terminal.write(data);
		}
	}

	private executeCommand(command: string) {
		// Handle built-in commands
		if (command.startsWith('cd ')) {
			const newPath = command.substring(3).trim();
			this.changeDirectory(newPath);
			return;
		}

		if (command === 'clear' || command === 'cls') {
			this.terminal.clear();
			this.writePrompt();
			return;
		}

		if (command === 'pwd') {
			this.terminal.writeln(this.cwd);
			this.writePrompt();
			return;
		}

		// Execute command
		exec(command, {
			cwd: this.cwd,
			env: process.env
		}, (error, stdout, stderr) => {
			if (stdout) {
				this.terminal.write(stdout);
			}
			if (stderr) {
				this.terminal.write('\x1b[31m' + stderr + '\x1b[0m');
			}
			if (error && !stderr) {
				this.terminal.writeln('\x1b[31m' + error.message + '\x1b[0m');
			}
			this.writePrompt();
		});
	}

	private changeDirectory(newPath: string) {
		try {
			// Resolve path
			let targetPath = newPath;
			if (newPath === '~') {
				targetPath = os.homedir();
			} else if (newPath.startsWith('~/')) {
				targetPath = path.join(os.homedir(), newPath.slice(2));
			} else if (!path.isAbsolute(newPath)) {
				targetPath = path.join(this.cwd, newPath);
			}

			// Normalize path
			targetPath = path.resolve(targetPath);

			// Check if directory exists (sync check for simplicity)
			const fs = require('fs');
			if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
				this.cwd = targetPath;
			} else {
				this.terminal.writeln('\x1b[31mcd: no such file or directory: ' + newPath + '\x1b[0m');
			}
		} catch (err) {
			this.terminal.writeln('\x1b[31mcd: ' + (err as Error).message + '\x1b[0m');
		}
		this.writePrompt();
	}

	async onClose() {
		if (this.shellProcess) {
			this.shellProcess.kill();
		}
		if (this.terminal) {
			this.terminal.dispose();
		}
	}

	private addStyles() {
		// Add xterm CSS if not already added
		if (!document.getElementById('xterm-styles')) {
			const style = document.createElement('link');
			style.id = 'xterm-styles';
			style.rel = 'stylesheet';
			style.href = 'app://obsidian.md/node_modules/@xterm/xterm/css/xterm.css';
			document.head.appendChild(style);
		}

		// Add custom styles
		if (!document.getElementById('terminal-custom-styles')) {
			const style = document.createElement('style');
			style.id = 'terminal-custom-styles';
			style.textContent = `
				.terminal-container {
					height: 100%;
					display: flex;
					flex-direction: column;
					padding: 0;
				}
				.terminal-wrapper {
					flex: 1;
					overflow: hidden;
					padding: 10px;
				}
				.terminal-wrapper .xterm {
					height: 100%;
				}
			`;
			document.head.appendChild(style);
		}
	}
}

class TerminalSettingTab extends PluginSettingTab {
	plugin: TerminalPlugin;

	constructor(app: App, plugin: TerminalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Terminal Settings' });

		new Setting(containerEl)
			.setName('Shell')
			.setDesc('Path to shell executable')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.shell)
				.setValue(this.plugin.settings.shell)
				.onChange(async (value) => {
					this.plugin.settings.shell = value || DEFAULT_SETTINGS.shell;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Font Size')
			.setDesc('Terminal font size in pixels')
			.addText(text => text
				.setPlaceholder(String(DEFAULT_SETTINGS.fontSize))
				.setValue(String(this.plugin.settings.fontSize))
				.onChange(async (value) => {
					const size = parseInt(value);
					if (!isNaN(size) && size > 0) {
						this.plugin.settings.fontSize = size;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Cursor Blink')
			.setDesc('Enable cursor blinking')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cursorBlink)
				.onChange(async (value) => {
					this.plugin.settings.cursorBlink = value;
					await this.plugin.saveSettings();
				}));
	}
}
