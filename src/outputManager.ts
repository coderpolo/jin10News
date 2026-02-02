import * as vscode from 'vscode';

export class OutputManager {
    private channel: vscode.OutputChannel;
    private static instance: OutputManager | null = null;

    private constructor() {
        this.channel = vscode.window.createOutputChannel('金十快讯');
    }

    static getInstance(): OutputManager {
        if (!OutputManager.instance) {
            OutputManager.instance = new OutputManager();
        }
        return OutputManager.instance;
    }

    appendLine(message: string): void {
        if (message.trim()) {
            this.channel.appendLine(message);
        }
    }

    appendNews(news: string): void {
        if (news.trim()) {
            this.channel.appendLine(news);
            this.channel.appendLine('─'.repeat(60));
        }
    }

    appendSeparator(): void {
        this.channel.appendLine('═'.repeat(60));
    }

    appendHeader(title: string): void {
        this.channel.appendLine('');
        this.channel.appendLine('═'.repeat(60));
        this.channel.appendLine(`  ${title}`);
        this.channel.appendLine('═'.repeat(60));
        this.channel.appendLine('');
    }

    show(): void {
        this.channel.show(true);
    }

    clear(): void {
        this.channel.clear();
    }

    dispose(): void {
        this.channel.dispose();
        OutputManager.instance = null;
    }
}
