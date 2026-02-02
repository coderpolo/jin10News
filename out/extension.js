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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const scheduler_1 = require("./scheduler");
const outputManager_1 = require("./outputManager");
let scheduler = null;
function activate(context) {
    console.log('金十快讯插件已激活');
    // 传入context以便使用globalState进行本地缓存
    scheduler = new scheduler_1.Scheduler(context);
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
            }
            else {
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
    vscode.window.showInformationMessage('金十快讯已就绪，执行 "Jin10: 开始抓取快讯" 开始获取实时资讯', '开始抓取').then(selection => {
        if (selection === '开始抓取' && scheduler) {
            scheduler.start();
        }
    });
}
function deactivate() {
    if (scheduler) {
        scheduler.dispose();
        scheduler = null;
    }
    outputManager_1.OutputManager.getInstance().dispose();
    console.log('金十快讯插件已停用');
}
//# sourceMappingURL=extension.js.map