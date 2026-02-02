"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scheduler = void 0;
const vscode = __importStar(require("vscode"));
const jin10Service_1 = require("./jin10Service");
const outputManager_1 = require("./outputManager");
const CACHE_KEY = 'jin10-news-cache';
const MAX_CACHE_SIZE = 500; // 最多缓存500条
class Scheduler {
    constructor(context) {
        this.timer = null;
        this.isRunning = false;
        this.displayedNews = [];
        this.context = context;
        this.jin10Service = new jin10Service_1.Jin10Service();
        this.outputManager = outputManager_1.OutputManager.getInstance();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'jin10-news.refresh';
        // 设置调试日志输出到OUTPUT面板
        (0, jin10Service_1.setDebugLogger)((msg) => {
            this.outputManager.appendLine(msg);
        });
        // 加载本地缓存
        this.loadCache();
    }
    loadCache() {
        const cached = this.context.globalState.get(CACHE_KEY);
        if (cached && cached.news && cached.news.length > 0) {
            this.displayedNews = cached.news;
            // 将缓存的ID添加到去重集合
            for (const item of cached.news) {
                this.jin10Service.markAsSeen(item.id);
            }
            console.log(`已加载 ${cached.news.length} 条缓存快讯，最后更新: ${cached.lastUpdate}`);
        }
    }
    saveCache() {
        const cacheData = {
            news: this.displayedNews.slice(0, MAX_CACHE_SIZE),
            lastUpdate: new Date().toLocaleString('zh-CN')
        };
        this.context.globalState.update(CACHE_KEY, cacheData);
    }
    clearCache() {
        this.displayedNews = [];
        this.jin10Service.clearHistory();
        this.context.globalState.update(CACHE_KEY, undefined);
        this.outputManager.clear();
        this.outputManager.appendLine('缓存已清除');
    }
    async start() {
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
        const interval = config.get('refreshInterval', 30) * 1000;
        this.timer = setInterval(async () => {
            await this.fetchNews();
        }, interval);
        vscode.window.showInformationMessage(`金十快讯开始抓取，每${interval / 1000}秒刷新一次`);
    }
    stop() {
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
    async refresh() {
        this.updateStatusBar('$(sync~spin) 刷新中...');
        await this.fetchNews();
        if (this.isRunning) {
            this.updateStatusBar('$(sync) 金十快讯');
        }
    }
    async fetchNews() {
        const now = new Date().toLocaleTimeString('zh-CN');
        try {
            const config = vscode.workspace.getConfiguration('jin10-news');
            const showImportantOnly = config.get('showImportantOnly', false);
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
        }
        catch (error) {
            this.outputManager.appendLine(`[${now}] ❌ 获取快讯失败: ${error}`);
        }
    }
    renderAllNews(updateTime, newCount) {
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
    updateStatusBar(text) {
        this.statusBarItem.text = text;
        this.statusBarItem.tooltip = '点击刷新金十快讯';
    }
    getRunningState() {
        return this.isRunning;
    }
    dispose() {
        // 停止前保存缓存
        this.saveCache();
        this.stop();
        this.statusBarItem.dispose();
    }
}
exports.Scheduler = Scheduler;
//# sourceMappingURL=scheduler.js.map