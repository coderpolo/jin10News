import * as vscode from 'vscode';
import { Scheduler } from './scheduler';
import { OutputManager } from './outputManager';

let scheduler: Scheduler | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('金十快讯插件已激活');

    // 传入context以便使用globalState进行本地缓存
    scheduler = new Scheduler(context);

    // 注册开始命令
    const startCommand = vscode.commands.registerCommand('jin10-news.start', async () => {
        if (scheduler) {
            await scheduler.start();
        }
    });

    // 注册停止命令
    const stopCommand = vscode.commands.registerCommand('jin10-news.stop', () => {
        if (scheduler) {
            scheduler.stop();
        }
    });

    // 注册刷新命令
    const refreshCommand = vscode.commands.registerCommand('jin10-news.refresh', async () => {
        if (scheduler) {
            if (!scheduler.getRunningState()) {
                // 如果没有运行，先启动
                await scheduler.start();
            } else {
                await scheduler.refresh();
            }
        }
    });

    // 注册清除缓存命令
    const clearCacheCommand = vscode.commands.registerCommand('jin10-news.clearCache', () => {
        if (scheduler) {
            scheduler.clearCache();
            vscode.window.showInformationMessage('金十快讯缓存已清除');
        }
    });

    context.subscriptions.push(startCommand, stopCommand, refreshCommand, clearCacheCommand);

    // 显示欢迎信息
    vscode.window.showInformationMessage(
        '金十快讯已就绪，执行 "Jin10: 开始抓取快讯" 开始获取实时资讯',
        '开始抓取'
    ).then(selection => {
        if (selection === '开始抓取' && scheduler) {
            scheduler.start();
        }
    });
}

export function deactivate() {
    if (scheduler) {
        scheduler.dispose();
        scheduler = null;
    }
    OutputManager.getInstance().dispose();
    console.log('金十快讯插件已停用');
}
