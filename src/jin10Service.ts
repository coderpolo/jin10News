import axios from 'axios';
import * as https from 'https';

export interface NewsItem {
    id: string;
    time: string;
    type: number;
    data: {
        title?: string;
        content?: string;
        pic?: string;
    };
    important: number;
    tags?: string[];
}

export interface FlashResponse {
    code: number;
    data: NewsItem[];
    message?: string;
}

// 调试日志回调
let debugLogger: ((msg: string) => void) | null = null;

export function setDebugLogger(logger: (msg: string) => void) {
    debugLogger = logger;
}

function log(msg: string) {
    if (debugLogger) {
        debugLogger(msg);
    }
}

export class Jin10Service {
    private seenIds: Set<string> = new Set();
    // 使用可用的API地址
    private readonly apiUrl = 'https://www.jin10.com/flash_newest.js';

    // 创建不使用代理的https agent
    private readonly httpsAgent = new https.Agent({
        rejectUnauthorized: true
    });

    async fetchFlashNews(): Promise<NewsItem[]> {
        try {
            // 清除环境变量中的代理设置
            const originalHttpProxy = process.env.HTTP_PROXY;
            const originalHttpsProxy = process.env.HTTPS_PROXY;
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
            delete process.env.http_proxy;
            delete process.env.https_proxy;

            log(`🌐 请求URL: ${this.apiUrl}`);

            const response = await axios.get(this.apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.jin10.com/',
                },
                timeout: 15000,
                proxy: false,
                httpsAgent: this.httpsAgent
            });

            // 恢复代理设置
            if (originalHttpProxy) process.env.HTTP_PROXY = originalHttpProxy;
            if (originalHttpsProxy) process.env.HTTPS_PROXY = originalHttpsProxy;

            log(`📡 响应状态: ${response.status}`);
            log(`📦 数据类型: ${typeof response.data}`);

            const jsContent = response.data;

            if (typeof jsContent === 'string') {
                log(`📝 数据长度: ${jsContent.length} 字符`);
                log(`📝 数据开头: ${jsContent.substring(0, 100)}...`);

                // 处理 var newest = [...] 格式
                let jsonStr = jsContent.trim();

                // 去掉 var newest = 前缀
                if (jsonStr.startsWith('var ')) {
                    const eqIndex = jsonStr.indexOf('=');
                    if (eqIndex !== -1) {
                        jsonStr = jsonStr.substring(eqIndex + 1).trim();
                    }
                }

                // 去掉末尾的分号
                if (jsonStr.endsWith(';')) {
                    jsonStr = jsonStr.slice(0, -1).trim();
                }

                log(`📝 处理后开头: ${jsonStr.substring(0, 50)}...`);

                if (jsonStr.startsWith('[')) {
                    try {
                        const news = JSON.parse(jsonStr) as NewsItem[];
                        log(`✅ 解析成功: ${news.length} 条`);
                        return news;
                    } catch (parseErr) {
                        log(`⚠️ JSON解析失败: ${parseErr}`);
                        // 尝试提取数组部分
                        const match = jsContent.match(/\[[\s\S]*\]/);
                        if (match) {
                            const news = JSON.parse(match[0]) as NewsItem[];
                            log(`✅ 正则提取成功: ${news.length} 条`);
                            return news;
                        }
                    }
                } else {
                    log(`⚠️ 处理后仍不是数组格式: ${jsonStr.substring(0, 50)}`);
                }
            } else if (Array.isArray(jsContent)) {
                log(`✅ 直接返回数组: ${jsContent.length} 条`);
                return jsContent as NewsItem[];
            } else {
                log(`⚠️ 未知数据类型: ${typeof jsContent}`);
            }

            return [];
        } catch (error: any) {
            log(`❌ 请求失败: ${error.message || error}`);
            if (error.response) {
                log(`❌ 响应状态: ${error.response.status}`);
            }
            return [];
        }
    }

    filterNewItems(items: NewsItem[]): NewsItem[] {
        const newItems: NewsItem[] = [];
        for (const item of items) {
            if (!this.seenIds.has(item.id)) {
                this.seenIds.add(item.id);
                newItems.push(item);
            }
        }
        // 保持seenIds不会无限增长
        if (this.seenIds.size > 1000) {
            const idsArray = Array.from(this.seenIds);
            this.seenIds = new Set(idsArray.slice(-500));
        }
        return newItems;
    }

    formatNews(item: NewsItem): string {
        const time = item.time || new Date().toLocaleTimeString('zh-CN');
        const importance = item.important >= 1 ? '⭐'.repeat(Math.min(item.important, 3)) : '';

        let content = '';
        if (item.data) {
            if (item.data.title) {
                content = item.data.title;
            }
            if (item.data.content) {
                content = content ? `${content}\n   ${item.data.content}` : item.data.content;
            }
        }

        // 清理HTML标签
        content = content.replace(/<[^>]+>/g, '');
        content = content.replace(/&nbsp;/g, ' ');
        content = content.replace(/&lt;/g, '<');
        content = content.replace(/&gt;/g, '>');
        content = content.replace(/&amp;/g, '&');

        if (!content.trim()) {
            return '';
        }

        const tags = item.tags && item.tags.length > 0 ? `[${item.tags.join(', ')}]` : '';

        return `[${time}] ${importance}${tags} ${content}`;
    }

    clearHistory(): void {
        this.seenIds.clear();
    }

    markAsSeen(id: string): void {
        this.seenIds.add(id);
    }
}
