// TronWeb 配置
const CONFIG = {
    nodes: {
        trongrid: {
            fullNode: 'https://api.trongrid.io',
            solidityNode: 'https://api.trongrid.io',
            eventServer: 'https://api.trongrid.io',
            keys: [
                'b51b041f-5806-49a8-9d75-07bd17efdf2a',
                '1b83cbf4-fb64-4eea-9a33-ad21663dd6a8',
                'c9350433-9d86-4c8f-bb40-e4c20740423e'
            ]
        }
    },
    usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    requestDelay: 1000, // 请求延迟 1 秒
    maxRetries: 3      // 最大重试次数
};

// 初始化 TronWeb 实例
let tronWeb = new TronWeb({
    fullNode: CONFIG.nodes.trongrid.fullNode,
    solidityNode: CONFIG.nodes.trongrid.solidityNode,
    eventServer: CONFIG.nodes.trongrid.eventServer,
    headers: { "TRON-PRO-API-KEY": CONFIG.nodes.trongrid.keys[0] }
});

// API 配置管理
class APIConfig {
    constructor() {
        this.nodes = CONFIG.nodes;
        this.currentNode = 'trongrid';
        this.failedAttempts = new Map();
        this.lastUseTime = new Map();
        
        // 初始化所有 key 的使用时间
        Object.values(this.nodes).forEach(node => {
            node.keys.forEach(key => {
                this.lastUseTime.set(key, 0);
            });
        });
    }

    // 获取当前可用的 API Key
    getCurrentKey() {
        const now = Date.now();
        const currentNode = this.nodes[this.currentNode];
        let bestKey = null;
        let longestWait = -1;

        // 找出等待时间最长的 key
        for (const key of currentNode.keys) {
            const lastUse = this.lastUseTime.get(key) || 0;
            const waitTime = now - lastUse;
            
            // 如果 key 已经冷却完毕
            if (waitTime >= CONFIG.requestDelay) {
                if (waitTime > longestWait) {
                    longestWait = waitTime;
                    bestKey = key;
                }
            }
        }

        // 如果没有可用的 key，使用等待时间最长的
        if (!bestKey) {
            bestKey = currentNode.keys[0];
            // 强制等待剩余冷却时间
            const lastUse = this.lastUseTime.get(bestKey) || 0;
            const remainingCooldown = CONFIG.requestDelay - (now - lastUse);
            if (remainingCooldown > 0) {
                return new Promise(resolve => {
                    setTimeout(() => {
                        this.lastUseTime.set(bestKey, Date.now());
                        resolve(bestKey);
                    }, remainingCooldown);
                });
            }
        }

        this.lastUseTime.set(bestKey, now);
        return bestKey;
    }

    // 标记 key 使用失败
    markKeyFailed(key) {
        const attempts = this.failedAttempts.get(key) || 0;
        this.failedAttempts.set(key, attempts + 1);
        
        if (attempts >= CONFIG.maxRetries) {
            // 将 key 冷却时间延长
            this.lastUseTime.set(key, Date.now() + CONFIG.requestDelay * 2);
            this.failedAttempts.delete(key);
        }
    }

    // 重置 key 状态
    resetKeyStatus(key) {
        this.failedAttempts.delete(key);
    }
}

// 动态设置 TronWeb 配置
async function updateTronWebConfig() {
    const apiConfig = new APIConfig();
    const currentKey = await apiConfig.getCurrentKey();
    tronWeb.setHeader({"TRON-PRO-API-KEY": currentKey});
    return apiConfig;
}

// 导出 TronWeb 实例
window.tronWeb = tronWeb;