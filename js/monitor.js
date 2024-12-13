// 监控的钱包数据结构
class WalletMonitor {
    constructor() {
        // 添加深色主题类
        document.body.classList.add('dark-theme');
        
        this.wallets = this.loadWallets();
        this.isMonitoring = false;
        this.requestCache = new Map();
        this.cacheTimeout = 30000; // 缓存30秒
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.requestDelay = 1000; // 请求间隔

        // 检查必要的 DOM 元素
        document.addEventListener('DOMContentLoaded', () => {
            const container = document.getElementById('walletList');
            if (!container) {
                console.error('找不到 walletList 容器，请检查 HTML');
                return;
            }
            // 初始显示
            this.updateWalletDisplay();
            // 给内容区域添加类名
            document.querySelector('.content-area').classList.add('dark-content');
        });
    }

    // 从本地存储加载钱包数据
    loadWallets() {
        const saved = localStorage.getItem('monitoredWallets');
        return saved ? JSON.parse(saved) : [];
    }

    // 保存钱包数据到本地存储
    saveWallets() {
        localStorage.setItem('monitoredWallets', JSON.stringify(this.wallets));
    }

    // 添加新钱包
    addWallet(address, note = '') {
        if (!tronWeb.isAddress(address)) {
            throw new Error('无效的钱包地址');
        }

        if (this.wallets.some(w => w.address === address)) {
            throw new Error('该钱包已在监控列表中');
        }

        this.wallets.push({
            address,
            note: note || address.slice(0, 6) + '...' + address.slice(-4),
            addedAt: Date.now()
        });

        this.saveWallets();
        this.updateWalletDisplay();
    }

    // 移除钱包
    removeWallet(address) {
        this.wallets = this.wallets.filter(w => w.address !== address);
        this.saveWallets();
        this.updateWalletDisplay();
    }

    // 添加请求到队列
    async addToQueue(callback) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ callback, resolve, reject });
            this.processQueue();
        });
    }

    // 处理请求队列
    async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const { callback, resolve, reject } = this.requestQueue.shift();
            try {
                const result = await callback();
                resolve(result);
            } catch (error) {
                if (error.message.includes('frequency limit')) {
                    // 如果是频率限制错误，等待一段时间后重试
                    const waitTime = this.extractWaitTime(error.message) || 5000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    this.requestQueue.unshift({ callback, resolve, reject });
                    continue;
                }
                reject(error);
            }
            // 添加请求间隔
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }

        this.isProcessingQueue = false;
    }

    // 从错误消息中提取等待时间
    extractWaitTime(message) {
        const match = message.match(/suspended for (\d+)/);
        return match ? parseInt(match[1]) * 1000 : null;
    }

    // 更新单个钱包的余额
    async updateWalletBalance(card, wallet) {
        const trxValueEl = card.querySelector('.trx-value');
        const usdtValueEl = card.querySelector('.usdt-value');
        
        trxValueEl.classList.add('updating');
        usdtValueEl.classList.add('updating');
        trxValueEl.textContent = '0.00';
        usdtValueEl.textContent = '0.00';
        
        try {
            // 使用队列处理请求
            const [trxBal, usdtBal] = await Promise.all([
                this.addToQueue(() => tronWeb.trx.getBalance(wallet.address)),
                this.addToQueue(async () => {
                    tronWeb.setAddress(wallet.address);
                    const contract = await tronWeb.contract().at(CONFIG.usdtContract);
                    return contract.balanceOf(wallet.address).call({
                        from: wallet.address
                    });
                })
            ]);

            const newTrxBalance = tronWeb.fromSun(trxBal);
            const newUsdtBalance = usdtBal ? (parseFloat(usdtBal.toString()) / 1e6).toFixed(2) : '0.00';

            this.animateNumber(trxValueEl, 0, parseFloat(newTrxBalance), 800);
            this.animateNumber(usdtValueEl, 0, parseFloat(newUsdtBalance), 800);

            setTimeout(() => {
                trxValueEl.classList.remove('updating');
                usdtValueEl.classList.remove('updating');
            }, 800);

        } catch (error) {
            console.error('获取余额失败:', error, wallet.address);
            trxValueEl.textContent = '查询失败';
            usdtValueEl.textContent = '查询失败';
            trxValueEl.classList.remove('updating');
            usdtValueEl.classList.remove('updating');
        }
    }

    // 添加数字动画方法
    animateNumber(element, start, end, duration) {
        const startTime = performance.now();
        const change = end - start;

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用缓动函数使动画更平滑
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = start + (change * easeOutQuart);

            // 根据数值大小决定小数位数
            const decimals = current >= 100 ? 2 : (current >= 1 ? 4 : 6);
            element.textContent = current.toFixed(decimals);

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = end.toFixed(decimals);
            }
        }

        requestAnimationFrame(update);
    }

    // 添加缓存处理方法
    async getCachedBalance(address) {
        const now = Date.now();
        const cached = this.requestCache.get(address);
        
        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        
        return null;
    }

    // 带重试的请求方法
    async makeRequest(requestFn, wallet) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount <= maxRetries) {
            try {
                const apiConfig = await updateTronWebConfig();
                await new Promise(resolve => setTimeout(resolve, this.requestDelay));
                const result = await requestFn();
                return result;
            } catch (error) {
                retryCount++;
                console.log(`请求失败 (${retryCount}/${maxRetries}):`, error.message);
                
                if (retryCount > maxRetries) {
                    throw error;
                }
                
                // 增加重试等待时间
                await new Promise(resolve => setTimeout(resolve, this.requestDelay * retryCount));
            }
        }
    }

    // 获取单个钱包余额
    async getWalletBalance(address) {
        try {
            const [trxBal, usdtBal] = await Promise.all([
                this.makeRequest(async () => {
                    return tronWeb.trx.getBalance(address);
                }),
                this.makeRequest(async () => {
                    const contract = await tronWeb.contract().at(CONFIG.usdtContract);
                    return contract.balanceOf(address).call();
                })
            ]);

            return {
                address,
                trx: (trxBal / 1e6).toFixed(6),
                usdt: (usdtBal / 1e6).toFixed(6),
                success: true
            };
        } catch (error) {
            console.error(`获取钱包 ${address} 余额失败:`, error);
            return {
                address,
                trx: '0.00',
                usdt: '0.00',
                success: false
            };
        }
    }

    // 批量获取钱包余额
    async batchGetBalances(wallets) {
        const results = [];
        
        // 串行处理每个钱包
        for (const wallet of wallets) {
            try {
                const result = await this.getWalletBalance(wallet.address);
                results.push({
                    ...result,
                    note: wallet.note
                });
                
                // 添加请求间隔
                await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            } catch (error) {
                results.push({
                    address: wallet.address,
                    note: wallet.note,
                    trx: '0.00',
                    usdt: '0.00',
                    success: false
                });
            }
        }
        
        return results;
    }

    // 更新钱包显示
    async updateWalletDisplay() {
        const container = document.getElementById('monitoredWallets');
        if (!container) {
            console.error('找不到 monitoredWallets 容器');
            return;
        }

        // 清空现有内容
        container.innerHTML = '';

        if (!this.wallets.length) {
            container.innerHTML = '<p class="no-wallet-tip">暂无监控的钱包</p>';
            return;
        }

        // 先创建所有卡片
        this.wallets.forEach(wallet => {
            const card = this.createWalletCard(wallet);
            container.appendChild(card);
        });

        // 然后异步更新所有卡片的余额
        this.updateAllBalances();
    }

    // 异步更新所有余额
    async updateAllBalances() {
        const container = document.getElementById('monitoredWallets');
        if (!container) return;

        for (const wallet of this.wallets) {
            const card = container.querySelector(`[data-address="${wallet.address}"]`);
            if (!card) continue;

            try {
                await this.updateWalletBalance(card, wallet);
                // 添加请求间隔
                await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            } catch (error) {
                console.error(`更新钱包 ${wallet.address} 失败:`, error);
                const trxEl = card.querySelector('.trx-value');
                const usdtEl = card.querySelector('.usdt-value');
                if (trxEl) trxEl.textContent = '查询失败';
                if (usdtEl) usdtEl.textContent = '查询失败';
            }
        }
    }

    // 刷新所有钱包
    async refreshAllWallets() {
        const container = document.getElementById('monitoredWallets');
        if (!container) return;

        // 标记所有余额为更新中
        container.querySelectorAll('.wallet-card').forEach(card => {
            const trxEl = card.querySelector('.trx-value');
            const usdtEl = card.querySelector('.usdt-value');
            if (trxEl) {
                trxEl.classList.add('updating');
                trxEl.textContent = '更新中...';
            }
            if (usdtEl) {
                usdtEl.classList.add('updating');
                usdtEl.textContent = '更新中...';
            }
        });

        // 更新所有余额
        await this.updateAllBalances();
    }

    // 启动监控
    async startMonitoring() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;

        const updateLoop = async () => {
            if (!this.isMonitoring) return;
            
            try {
                await this.updateWalletDisplay();
            } catch (error) {
                console.error('更新钱包显示失败:', error);
            }

            // 等待30秒后再次更新
            setTimeout(updateLoop, 30000);
        };

        await updateLoop();
    }

    // 停止监控
    stopMonitoring() {
        this.isMonitoring = false;
    }

    // 刷新单个钱包
    async refreshWallet(address) {
        const card = document.querySelector(`.wallet-card[data-address="${address}"]`);
        if (!card) return;

        const trxValueEl = card.querySelector('.trx-value');
        const usdtValueEl = card.querySelector('.usdt-value');

        trxValueEl.classList.add('updating');
        usdtValueEl.classList.add('updating');

        try {
            const balance = await this.getWalletBalance(address);
            if (balance.success) {
                this.animateNumber(trxValueEl, 0, parseFloat(balance.trx), 800);
                this.animateNumber(usdtValueEl, 0, parseFloat(balance.usdt), 800);
            }
        } catch (error) {
            console.error('刷新钱包失败:', error);
            trxValueEl.textContent = '查询失败';
            usdtValueEl.textContent = '查询失败';
        } finally {
            setTimeout(() => {
                trxValueEl.classList.remove('updating');
                usdtValueEl.classList.remove('updating');
            }, 800);
        }
    }

    // 修改卡片生成模板
    generateCardHTML(wallet, trxBalance = '加载中...', usdtBalance = '加载中...') {
        return `
            <div class="note" data-no-drag="true">
                <span class="note-text">${wallet.note}</span>
                <div class="card-actions">
                    <button onclick="window.walletMonitor.refreshWallet('${wallet.address}')" class="refresh-btn" title="刷新余额" data-no-drag="true">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button onclick="window.walletMonitor.editWallet('${wallet.address}')" class="edit-btn" title="修改备注" data-no-drag="true">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="window.walletMonitor.removeWallet('${wallet.address}')" class="remove-btn" title="删除监控" data-no-drag="true">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="address" data-no-drag="true">
                <span>${wallet.address}</span>
                <div class="address-actions">
                    <button onclick="copyToClipboard('${wallet.address}')" class="copy-btn" title="复制地址" data-no-drag="true">
                        <i class="fas fa-copy"></i>
                    </button>
                    <a href="https://tronscan.org/#/address/${wallet.address}" target="_blank" title="在 TronScan 查看" data-no-drag="true">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            </div>
            <div class="balances" data-no-drag="true">
                <div class="balance-item">
                    <span>TRX:</span>
                    <span class="balance-value trx-value">${trxBalance}</span>
                </div>
                <div class="balance-item">
                    <span>USDT:</span>
                    <span class="balance-value usdt-value">${usdtBalance}</span>
                </div>
            </div>
        `;
    }

    // 添加拖动事件监听
    addDragListeners(card) {
        card.addEventListener('dragstart', (e) => {
            // 如果点击的是按钮或链接，不启动拖动
            if (e.target.closest('[data-no-drag="true"]')) {
                e.preventDefault();
                return;
            }
            
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingCard = document.querySelector('.wallet-card.dragging');
            if (!draggingCard || draggingCard === card) return;

            const container = document.getElementById('monitoredWallets');
            const cards = [...container.getElementsByClassName('wallet-card')];
            const currentPos = cards.indexOf(card);
            const draggingPos = cards.indexOf(draggingCard);

            // 判断是放在目标卡片的前面还是后面
            const rect = card.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const mouseY = e.clientY;

            if (mouseY < midY) {
                // 放在目标卡片前面
                if (draggingPos > currentPos) {
                    container.insertBefore(draggingCard, card);
                } else {
                    container.insertBefore(draggingCard, card);
                }
            } else {
                // 放在目标卡片后面
                if (draggingPos < currentPos) {
                    container.insertBefore(draggingCard, card.nextSibling);
                } else {
                    container.insertBefore(draggingCard, card.nextSibling);
                }
            }

            // 更新钱包顺序
            this.updateWalletsOrder();
        });
    }

    // 更新钱包顺序
    updateWalletsOrder() {
        const container = document.getElementById('monitoredWallets');
        const cards = [...container.getElementsByClassName('wallet-card')];
        
        // 根据当前DOM顺序重新排序钱包数组
        const newWallets = cards.map(card => {
            const address = card.getAttribute('data-address');
            return this.wallets.find(w => w.address === address);
        }).filter(Boolean); // 过滤掉可能的null值

        // 更新钱包数组
        this.wallets = newWallets;
        
        // 保存到本地存储
        this.saveWallets();
    }

    // 添加编辑钱包方法
    async editWallet(address) {
        const wallet = this.wallets.find(w => w.address === address);
        if (!wallet) return;

        // 创建编辑对话框
        const editDialog = document.createElement('div');
        editDialog.className = 'modal';
        editDialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>修改钱包备注</h3>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="input-group">
                        <label>钱包地址</label>
                        <input type="text" value="${address}" disabled>
                    </div>
                    <div class="input-group">
                        <label>备注名称</label>
                        <input type="text" id="editWalletNote" value="${wallet.note}" placeholder="输入备注名称">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="primary-btn confirm-edit">确认修改</button>
                    <button class="cancel-btn close">取消</button>
                </div>
            </div>
        `;

        document.body.appendChild(editDialog);
        editDialog.style.display = 'block';

        // 添加事件监听
        const closeButtons = editDialog.querySelectorAll('.close');
        const confirmButton = editDialog.querySelector('.confirm-edit');
        const noteInput = editDialog.querySelector('#editWalletNote');

        closeButtons.forEach(btn => {
            btn.onclick = () => {
                editDialog.remove();
            };
        });

        confirmButton.onclick = () => {
            const newNote = noteInput.value.trim();
            if (newNote) {
                wallet.note = newNote;
                this.saveWallets();
                this.updateWalletDisplay();
            }
            editDialog.remove();
        };

        // 点击外部关闭
        editDialog.onclick = (event) => {
            if (event.target === editDialog) {
                editDialog.remove();
            }
        };
    }

    // 创建钱包卡片
    createWalletCard(wallet) {
        const card = document.createElement('div');
        card.className = 'wallet-card';
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-address', wallet.address);
        
        card.innerHTML = `
            <div class="card-header">
                <span class="wallet-note">${wallet.note}</span>
                <div class="card-actions">
                    <button class="edit-btn" onclick="window.walletMonitor.editWallet('${wallet.address}')" title="编辑备注">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${wallet.address}')" title="复制地址">
                        <i class="far fa-copy"></i>
                    </button>
                    <button class="refresh-btn" onclick="window.walletMonitor.refreshWallet('${wallet.address}')" title="刷新余额">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="remove-btn" onclick="window.walletMonitor.removeWallet('${wallet.address}')" title="删除钱包">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="wallet-address">
                <span class="address-text">${wallet.address.slice(0, 12)}...${wallet.address.slice(-8)}</span>
                <a href="https://tronscan.org/#/address/${wallet.address}" target="_blank" title="在 Tronscan 中查看">
                    <i class="fas fa-external-link-alt"></i>
                </a>
            </div>
            <div class="balance-info">
                <div class="balance-item">
                    <span class="balance-label">TRX 余额</span>
                    <span class="balance-value trx-value">加载中...</span>
                </div>
                <div class="balance-item">
                    <span class="balance-label">USDT 余额</span>
                    <span class="balance-value usdt-value">加载中...</span>
                </div>
            </div>
        `;

        // 添加拖拽事件监听
        this.addDragListeners(card);
        
        // 添加复制成功提示
        const copyBtn = card.querySelector('.copy-btn');
        copyBtn.addEventListener('click', () => {
            const tip = document.getElementById('copyTip');
            tip.classList.add('show');
            setTimeout(() => tip.classList.remove('show'), 2000);
        });
        
        return card;
    }
}

// 初始化钱包监控
window.walletMonitor = new WalletMonitor();

// 添加事件监听
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('addWalletModal');
    const addBtn = document.getElementById('addWalletBtn');
    const closeButtons = document.querySelectorAll('.close');
    const confirmBtn = document.getElementById('confirmAddWallet');

    if (addBtn) {
        // 打开模态框
        addBtn.onclick = function() {
            modal.style.display = 'block';
        }
    }

    // 关闭模态框
    closeButtons.forEach(btn => {
        btn.onclick = function() {
            modal.style.display = 'none';
        }
    });

    // 点击模态框外部关闭
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    // 确认添加钱包
    if (confirmBtn) {
        confirmBtn.onclick = async function() {
            const address = document.getElementById('walletAddress').value.trim();
            const note = document.getElementById('walletNote').value.trim();

            try {
                await window.walletMonitor.addWallet(address, note);
                modal.style.display = 'none';
                // 清空输入框
                document.getElementById('walletAddress').value = '';
                document.getElementById('walletNote').value = '';
            } catch (error) {
                alert(error.message);
            }
        }
    }

    // 添加刷新按钮的事件监听
    const refreshBtn = document.getElementById('refreshWalletsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await window.walletMonitor.refreshAllWallets();
        });
    }
}); 