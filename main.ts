import { App, ItemView, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { exec, spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';

const VIEW_TYPE_TERMINAL = 'terminal-view';

interface TerminalPluginSettings {
	// Shell settings
	shell: string;
	startupDirectory: string;

	// Appearance
	fontSize: number;
	fontFamily: string;
	lineHeight: number;
	letterSpacing: number;

	// Colors
	useCustomColors: boolean;
	backgroundColor: string;
	foregroundColor: string;
	cursorColor: string;
	selectionColor: string;

	// Cursor
	cursorBlink: boolean;
	cursorStyle: 'block' | 'underline' | 'bar';

	// Behavior
	scrollback: number;
	fastScrollModifier: 'alt' | 'shift' | 'ctrl';
	copyOnSelect: boolean;
	rightClickSelectsWord: boolean;

	// Advanced
	bellSound: boolean;
	allowTransparency: boolean;
	macOptionIsMeta: boolean;
}

const DEFAULT_SETTINGS: TerminalPluginSettings = {
	// Shell settings
	shell: os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash',
	startupDirectory: '',

	// Appearance
	fontSize: 14,
	fontFamily: 'Menlo, Monaco, "Courier New", monospace',
	lineHeight: 1.0,
	letterSpacing: 0,

	// Colors
	useCustomColors: false,
	backgroundColor: '#1e1e1e',
	foregroundColor: '#cccccc',
	cursorColor: '#ffffff',
	selectionColor: 'rgba(255, 255, 255, 0.3)',

	// Cursor
	cursorBlink: true,
	cursorStyle: 'block',

	// Behavior
	scrollback: 1000,
	fastScrollModifier: 'alt',
	copyOnSelect: false,
	rightClickSelectsWord: true,

	// Advanced
	bellSound: false,
	allowTransparency: false,
	macOptionIsMeta: false,
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
		// Use custom startup directory if set, otherwise use home
		if (this.settings.startupDirectory && this.settings.startupDirectory.trim()) {
			this.cwd = this.settings.startupDirectory.trim();
		} else {
			this.cwd = process.env.HOME || process.env.USERPROFILE || os.homedir();
		}
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

		// Determine colors based on settings
		let bgColor, fgColor, cursorColor, selectionColor;

		if (this.settings.useCustomColors) {
			bgColor = this.settings.backgroundColor;
			fgColor = this.settings.foregroundColor;
			cursorColor = this.settings.cursorColor;
			selectionColor = this.settings.selectionColor;
		} else {
			bgColor = getComputedStyle(document.body).getPropertyValue('--background-secondary').trim() || '#202020';
			fgColor = getComputedStyle(document.body).getPropertyValue('--text-normal').trim() || '#cccccc';
			cursorColor = getComputedStyle(document.body).getPropertyValue('--text-accent').trim() || '#ffffff';
			selectionColor = 'rgba(255, 255, 255, 0.3)';
		}

		// Initialize xterm.js with all settings
		this.terminal = new Terminal({
			// Appearance
			cursorBlink: this.settings.cursorBlink,
			cursorStyle: this.settings.cursorStyle,
			fontSize: this.settings.fontSize,
			fontFamily: this.settings.fontFamily,
			lineHeight: this.settings.lineHeight,
			letterSpacing: this.settings.letterSpacing,

			// Theme
			theme: {
				background: bgColor,
				foreground: fgColor,
				cursor: cursorColor,
				selectionBackground: selectionColor,
			},

			// Behavior
			scrollback: this.settings.scrollback,
			fastScrollModifier: this.settings.fastScrollModifier,
			rightClickSelectsWord: this.settings.rightClickSelectsWord,

			// Advanced
			allowTransparency: this.settings.allowTransparency,
			macOptionIsMeta: this.settings.macOptionIsMeta,

			convertEol: true,
			rows: 24  // Start with fewer rows
		});

		// Add fit addon
		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);

		// Open terminal in DOM
		this.terminal.open(terminalEl);

		// Fit terminal to container
		this.fitAddon.fit();

		// Clear any initial buffer content
		this.terminal.clear();

		// Write prompt directly without welcome message (don't scroll yet)
		this.writePrompt(false, false);

		// Force scroll to top multiple times to ensure it works
		setTimeout(() => {
			this.terminal.scrollToTop();
			// Reset viewport scroll as well
			const viewport = terminalEl.querySelector('.xterm-viewport') as HTMLElement;
			if (viewport) {
				viewport.scrollTop = 0;
			}
		}, 50);

		// Handle terminal input
		this.terminal.onData((data: string) => {
			this.handleInput(data);
		});

		// Handle selection copy
		if (this.settings.copyOnSelect) {
			this.terminal.onSelectionChange(() => {
				const selection = this.terminal.getSelection();
				if (selection) {
					navigator.clipboard.writeText(selection);
				}
			});
		}

		// Handle bell
		if (this.settings.bellSound) {
			this.terminal.onBell(() => {
				// Play system bell sound
				const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDGH0fPTgjMGHm7A7+OZWBE=');
				audio.play();
			});
		}

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

	private writePrompt(newLine: boolean = true, scrollToBottom: boolean = true) {
		const prompt = `${newLine ? '\r\n' : ''}\x1b[32m${this.cwd}\x1b[0m $ `;
		this.terminal.write(prompt);
		// Only scroll to bottom if requested (not on initial load)
		if (scrollToBottom) {
			this.terminal.scrollToBottom();
		}
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
			this.writePrompt(false, false);
			// Force scroll to top after clear
			setTimeout(() => {
				this.terminal.scrollToTop();
				const viewport = this.containerEl.querySelector('.xterm-viewport') as HTMLElement;
				if (viewport) {
					viewport.scrollTop = 0;
				}
			}, 10);
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

		containerEl.createEl('h1', { text: 'Terminal Sidebar Settings' });

		// Add Apply Changes button at the top
		new Setting(containerEl)
			.setName('Apply Changes')
			.setDesc('Reload the terminal to apply all changes')
			.addButton(button => button
				.setButtonText('Reload Terminal')
				.setCta()
				.onClick(async () => {
					// Close all terminal views
					this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
					// Wait a bit
					await new Promise(resolve => setTimeout(resolve, 100));
					// Reopen terminal
					await this.plugin.activateView();
					// Scroll to top after a small delay to let the view render
					await new Promise(resolve => setTimeout(resolve, 50));
					const terminalLeaf = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL)[0];
					if (terminalLeaf) {
						const viewContent = terminalLeaf.view.containerEl.querySelector('.view-content');
						if (viewContent) {
							viewContent.scrollTop = 0;
						}
					}
				}));

		// ========== Shell Settings ==========
		containerEl.createEl('h2', { text: 'Shell' });

		new Setting(containerEl)
			.setName('Shell Path')
			.setDesc('Path to your preferred shell executable')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.shell)
				.setValue(this.plugin.settings.shell)
				.onChange(async (value) => {
					this.plugin.settings.shell = value || DEFAULT_SETTINGS.shell;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Startup Directory')
			.setDesc('Directory to start in (leave empty for home directory)')
			.addText(text => text
				.setPlaceholder(os.homedir())
				.setValue(this.plugin.settings.startupDirectory)
				.onChange(async (value) => {
					this.plugin.settings.startupDirectory = value;
					await this.plugin.saveSettings();
				}));

		// ========== Appearance Settings ==========
		containerEl.createEl('h2', { text: 'Appearance' });

		new Setting(containerEl)
			.setName('Font Size')
			.setDesc('Terminal font size in pixels (8-32)')
			.addSlider(slider => slider
				.setLimits(8, 32, 1)
				.setValue(this.plugin.settings.fontSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.fontSize = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Font Family')
			.setDesc('Terminal font family (use monospace fonts)')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.fontFamily)
				.setValue(this.plugin.settings.fontFamily)
				.onChange(async (value) => {
					this.plugin.settings.fontFamily = value || DEFAULT_SETTINGS.fontFamily;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Line Height')
			.setDesc('Spacing between lines (0.8-2.0)')
			.addSlider(slider => slider
				.setLimits(0.8, 2.0, 0.1)
				.setValue(this.plugin.settings.lineHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.lineHeight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Letter Spacing')
			.setDesc('Space between characters in pixels (-5 to 10)')
			.addSlider(slider => slider
				.setLimits(-5, 10, 1)
				.setValue(this.plugin.settings.letterSpacing)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.letterSpacing = value;
					await this.plugin.saveSettings();
				}));

		// ========== Color Settings ==========
		containerEl.createEl('h2', { text: 'Colors' });

		new Setting(containerEl)
			.setName('Use Custom Colors')
			.setDesc('Enable custom color scheme (disable to use Obsidian theme colors)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useCustomColors)
				.onChange(async (value) => {
					this.plugin.settings.useCustomColors = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide color pickers
				}));

		if (this.plugin.settings.useCustomColors) {
			new Setting(containerEl)
				.setName('Background Color')
				.setDesc('Terminal background color')
				.addColorPicker(color => color
					.setValue(this.plugin.settings.backgroundColor)
					.onChange(async (value) => {
						this.plugin.settings.backgroundColor = value;
						await this.plugin.saveSettings();
					}))
				.addExtraButton(button => button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.backgroundColor = DEFAULT_SETTINGS.backgroundColor;
						await this.plugin.saveSettings();
						this.display();
					}));

			new Setting(containerEl)
				.setName('Text Color')
				.setDesc('Terminal text color')
				.addColorPicker(color => color
					.setValue(this.plugin.settings.foregroundColor)
					.onChange(async (value) => {
						this.plugin.settings.foregroundColor = value;
						await this.plugin.saveSettings();
					}))
				.addExtraButton(button => button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.foregroundColor = DEFAULT_SETTINGS.foregroundColor;
						await this.plugin.saveSettings();
						this.display();
					}));

			new Setting(containerEl)
				.setName('Cursor Color')
				.setDesc('Cursor color')
				.addColorPicker(color => color
					.setValue(this.plugin.settings.cursorColor)
					.onChange(async (value) => {
						this.plugin.settings.cursorColor = value;
						await this.plugin.saveSettings();
					}))
				.addExtraButton(button => button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.cursorColor = DEFAULT_SETTINGS.cursorColor;
						await this.plugin.saveSettings();
						this.display();
					}));

			new Setting(containerEl)
				.setName('Selection Color')
				.setDesc('Selected text background (Note: color picker may not support transparency)')
				.addText(text => text
					.setPlaceholder(DEFAULT_SETTINGS.selectionColor)
					.setValue(this.plugin.settings.selectionColor)
					.onChange(async (value) => {
						this.plugin.settings.selectionColor = value || DEFAULT_SETTINGS.selectionColor;
						await this.plugin.saveSettings();
					}))
				.addExtraButton(button => button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.selectionColor = DEFAULT_SETTINGS.selectionColor;
						await this.plugin.saveSettings();
						this.display();
					}));
		}

		// ========== Cursor Settings ==========
		containerEl.createEl('h2', { text: 'Cursor' });

		new Setting(containerEl)
			.setName('Cursor Blink')
			.setDesc('Enable cursor blinking animation')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cursorBlink)
				.onChange(async (value) => {
					this.plugin.settings.cursorBlink = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Cursor Style')
			.setDesc('Choose cursor appearance')
			.addDropdown(dropdown => dropdown
				.addOption('block', 'Block')
				.addOption('underline', 'Underline')
				.addOption('bar', 'Bar')
				.setValue(this.plugin.settings.cursorStyle)
				.onChange(async (value: 'block' | 'underline' | 'bar') => {
					this.plugin.settings.cursorStyle = value;
					await this.plugin.saveSettings();
				}));

		// ========== Behavior Settings ==========
		containerEl.createEl('h2', { text: 'Behavior' });

		new Setting(containerEl)
			.setName('Scrollback Lines')
			.setDesc('Number of lines to keep in history (1000-50000)')
			.addSlider(slider => slider
				.setLimits(1000, 50000, 1000)
				.setValue(this.plugin.settings.scrollback)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.scrollback = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Fast Scroll Modifier')
			.setDesc('Key to hold for faster scrolling')
			.addDropdown(dropdown => dropdown
				.addOption('alt', 'Alt')
				.addOption('shift', 'Shift')
				.addOption('ctrl', 'Ctrl')
				.setValue(this.plugin.settings.fastScrollModifier)
				.onChange(async (value: 'alt' | 'shift' | 'ctrl') => {
					this.plugin.settings.fastScrollModifier = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Copy on Select')
			.setDesc('Automatically copy selected text to clipboard')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.copyOnSelect)
				.onChange(async (value) => {
					this.plugin.settings.copyOnSelect = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Right Click Selects Word')
			.setDesc('Right-click selects the word under cursor')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.rightClickSelectsWord)
				.onChange(async (value) => {
					this.plugin.settings.rightClickSelectsWord = value;
					await this.plugin.saveSettings();
				}));

		// ========== Advanced Settings ==========
		containerEl.createEl('h2', { text: 'Advanced' });

		new Setting(containerEl)
			.setName('Bell Sound')
			.setDesc('Play sound when terminal bell character is received')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.bellSound)
				.onChange(async (value) => {
					this.plugin.settings.bellSound = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Allow Transparency')
			.setDesc('Enable terminal background transparency (requires custom colors)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.allowTransparency)
				.onChange(async (value) => {
					this.plugin.settings.allowTransparency = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Mac Option is Meta')
			.setDesc('Treat Option key as Meta on macOS')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.macOptionIsMeta)
				.onChange(async (value) => {
					this.plugin.settings.macOptionIsMeta = value;
					await this.plugin.saveSettings();
				}));

		// Info footer
		containerEl.createEl('p', {
			text: 'Tip: Use the "Reload Terminal" button above to apply changes immediately.',
			cls: 'setting-item-description'
		});
	}
}
