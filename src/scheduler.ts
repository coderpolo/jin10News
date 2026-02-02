import * as vscode from 'vscode';
import { Jin10Service, NewsItem, setDebugLogger } from './jin10Service';
import { OutputManager } from './outputManager';

const CACHE_KEY = 'jin10-news-cache';
const MAX_CACHE_SIZE = 500; // 最多缓存500条

interface CacheData {
    news: NewsItem[];
    lastUpdate: string;
}

export class Scheduler {
    private timer: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private jin10Service: Jin10Service;
    private outputManager: OutputManager;
    private statusBarItem: vscode.StatusBarItem;
    private displayedNews: NewsItem[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.jin10Service = new Jin10Service();
        this.outputManager = OutputManager.getInstance();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'jin10-news.refresh';

        // 设置调试日志输出到OUTPUT面板
        setDebugLogger((msg) => {
            this.outputManager.appendLine(msg);
        });

        // 加载本地缓存
        this.loadCache();
    }

    private loadCache(): void {
        const cached = this.context.globalState.get<CacheData>(CACHE_KEY);
        if (cached && cached.news && cached.news.length > 0) {
            this.displayedNews = cached.news;
            // 将缓存的ID添加到去重集合
            for (const item of cached.news) {
                this.jin10Service.markAsSeen(item.id);
            }
            console.log(`已加载 ${cached.news.length} 条缓存快讯，最后更新: ${cached.lastUpdate}`);
        }
    }

    private saveCache(): void {
        const cacheData: CacheData = {
            news: this.displayedNews.slice(0, MAX_CACHE_SIZE),
            lastUpdate: new Date().toLocaleString('zh-CN')
        };
        this.context.globalState.update(CACHE_KEY, cacheData);
    }

    clearCache(): void {
        this.displayedNews = [];
        this.jin10Service.clearHistory();
        this.context.globalState.update(CACHE_KEY, undefined);
        this.outputManager.clear();
        this.outputManager.appendLine('缓存已清除');
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            vscode.window.showInformationMessage('金十快讯抓取已在运行');
            return;
        }

        this.isRunning = true;
        this.updateStatusBar('$(sync~spin) 金十快讯');
        this.statusBarItem.show();

        this.outputManager.clear();
        this.outputManager.appendHeader('金十财经快讯');

        if (this.displayedNews.length > 0) {
            this.outputManager.appendLine(`已加载 ${this.displayedNews.length} 条缓存消息`);
        }

        this.outputManager.appendLine(`开始时间: ${new Date().toLocaleString('zh-CN')}`);
        this.outputManager.appendLine('最新消息显示在顶部 | 自动去重 | 本地缓存');
        this.outputManager.appendSeparator();

        // 先显示缓存的消息
        if (this.displayedNews.length > 0) {
            this.renderAllNews('缓存', 0);
        }

        this.outputManager.show();

        // 立即获取一次
        await this.fetchNews();

        // 设置定时器
        const config = vscode.workspace.getConfiguration('jin10-news');
        const interval = config.get<number>('refreshInterval', 30) * 1000;

        this.timer = setInterval(async () => {
            await this.fetchNews();
        }, interval);

        vscode.window.showInformationMessage(`金十快讯开始抓取，每${interval / 1000}秒刷新一次`);
    }

    stop(): void {
        if (!this.isRunning) {
            vscode.window.showInformationMessage('金十快讯抓取未在运行');
            return;
        }

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.isRunning = false;
        this.statusBarItem.hide();

        // 保存缓存
        this.saveCache();

        this.outputManager.appendSeparator();
        this.outputManager.appendLine(`停止时间: ${new Date().toLocaleString('zh-CN')}`);
        this.outputManager.appendLine(`已缓存 ${this.displayedNews.length} 条消息`);
        this.outputManager.appendHeader('金十财经快讯 - 已停止');

        vscode.window.showInformationMessage('金十快讯已停止抓取');
    }

    async refresh(): Promise<void> {
        this.updateStatusBar('$(sync~spin) 刷新中...');
        await this.fetchNews();
        if (this.isRunning) {
            this.updateStatusBar('$(sync) 金十快讯');
        }
    }

    private async fetchNews(): Promise<void> {
        const now = new Date().toLocaleTimeString('zh-CN');

        try {
            const config = vscode.workspace.getConfiguration('jin10-news');
            const showImportantOnly = config.get<boolean>('showImportantOnly', false);

            const allNews = await this.jin10Service.fetchFlashNews();

            let newItems = this.jin10Service.filterNewItems(allNews);

            if (showImportantOnly) {
                newItems = newItems.filter(item => item.important >= 1);
            }

            if (newItems.length > 0) {
                // 按时间倒序排列新消息（最新的在前）
                newItems.sort((a, b) => {
                    return new Date(b.time).getTime() - new Date(a.time).getTime();
                });

                // 新消息插入到头部
                this.displayedNews = [...newItems, ...this.displayedNews];

                // 限制最多保存的条数
                if (this.displayedNews.length > MAX_CACHE_SIZE) {
                    this.displayedNews = this.displayedNews.slice(0, MAX_CACHE_SIZE);
                }

                // 保存到本地缓存
                this.saveCache();

                // 重新渲染整个列表
                this.renderAllNews(now, newItems.length);

                this.updateStatusBar(`$(sync) 金十 +${newItems.length}`);

                // 3秒后恢复正常显示
                setTimeout(() => {
                    if (this.isRunning) {
                        this.updateStatusBar('$(sync) 金十快讯');
                    }
                }, 3000);
            }
        } catch (error) {
            this.outputManager.appendLine(`[${now}] ❌ 获取快讯失败: ${error}`);
        }
    }

    private renderAllNews(updateTime: string, newCount: number): void {
        this.outputManager.clear();

        // 头部信息
        this.outputManager.appendHeader('金十财经快讯');
        this.outputManager.appendLine(`最后更新: ${updateTime} | 新增: ${newCount} 条 | 共 ${this.displayedNews.length} 条 (已缓存)`);
        this.outputManager.appendSeparator();

        // 按时间倒序显示所有新闻（最新的在顶部）
        for (const item of this.displayedNews) {
            const formatted = this.jin10Service.formatNews(item);
            if (formatted) {
                this.outputManager.appendNews(formatted);
            }
        }
    }

    private updateStatusBar(text: string): void {
        this.statusBarItem.text = text;
        this.statusBarItem.tooltip = '点击刷新金十快讯';
    }

    getRunningState(): boolean {
        return this.isRunning;
    }

    dispose(): void {
        // 停止前保存缓存
        this.saveCache();
        this.stop();
        this.statusBarItem.dispose();
    }
}
