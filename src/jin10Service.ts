import axios from 'axios';
import * as https from 'https';
import * as dns from 'dns';
import * as vscode from 'vscode'; // 引入 vscode

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
    // 检查配置，只有开启调试日志才输出
    const config = vscode.workspace.getConfiguration('jin10-news');
    if (config.get<boolean>('debug', false) && debugLogger) {
        debugLogger(msg);
    }
}

export class Jin10Service {
    private seenIds: Set<string> = new Set();

    // 默认备选IP（阿里云CDN IP池）
    private readonly defaultIps = [
        '220.181.171.124',
        '220.181.171.125',
        '220.181.171.126',
        '220.181.171.127',
        '220.181.171.128',
        '220.181.171.129',
        '220.181.171.130',
        '220.181.171.131'
    ];
    private availableIps: string[] = [];
    private readonly domain = 'www.jin10.com';
    private readonly apiPath = '/flash_newest.js';

    // 创建不使用代理的https agent，并忽略证书错误（因为使用IP访问）
    private readonly httpsAgent = new https.Agent({
        rejectUnauthorized: false
    });

    constructor() {
        this.availableIps = [...this.defaultIps];
        this.resolveDomainIps();
    }

    // 尝试解析域名获取最新IP池
    private resolveDomainIps() {
        dns.resolve4(this.domain, (err, addresses) => {
            if (err) {
                log(`⚠️ 域名解析失败: ${err.message}，将使用默认IP`);
            } else if (addresses && addresses.length > 0) {
                log(`✅ 域名解析成功: ${addresses.join(', ')}`);
                // 合并解析出的IP和默认IP，去重
                this.availableIps = Array.from(new Set([...addresses, ...this.defaultIps]));
            }
        });
    }

    // 随机获取一个IP
    private getRandomIp(): string {
        if (this.availableIps.length === 0) {
            return this.defaultIps[0];
        }
        const index = Math.floor(Math.random() * this.availableIps.length);
        return this.availableIps[index];
    }

    async fetchFlashNews(): Promise<NewsItem[]> {
        const ip = this.getRandomIp();
        const url = `https://${ip}${this.apiPath}`;

        try {
            // 清除环境变量中的代理设置
            const originalHttpProxy = process.env.HTTP_PROXY;
            const originalHttpsProxy = process.env.HTTPS_PROXY;
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
            delete process.env.http_proxy;
            delete process.env.https_proxy;

            log(`🌐 请求URL: ${url} (Host: ${this.domain})`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.jin10.com/',
                    'Host': this.domain, // 必须加上Host头
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
