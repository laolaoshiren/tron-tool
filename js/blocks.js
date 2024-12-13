let isMonitoringBlocks = false;
let blockMonitorInterval = null;
let isBlocksPanelVisible = false;
let currentPage = 1;
let blocksPerPage = 10;
let latestBlock = 0;
let lastNewBlock = null; // 用于追踪最新区块

// 初始化区块监控
function initializeBlockMonitor() {
    if (!isMonitoringBlocks) return;
    
    // 如果面板不可见，不启动监控
    if (!isBlocksPanelVisible) return;

    getLatestBlock();
    startBlockMonitor();
}

// 开始区块监控
function startBlockMonitor() {
    if (blockMonitorInterval) {
        clearInterval(blockMonitorInterval);
    }
    
    blockMonitorInterval = setInterval(() => {
        // 只在面板可见时更新
        if (isBlocksPanelVisible && isMonitoringBlocks) {
            getLatestBlock();
        }
    }, 3000);
}

// 停止区块监控
function stopBlockMonitor() {
    if (blockMonitorInterval) {
        clearInterval(blockMonitorInterval);
        blockMonitorInterval = null;
    }
    isMonitoringBlocks = false;
}

// 修改 js/ui.js 中的导航处理
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-links li');
    const panels = {
        '钱包恢复': document.querySelector('.wallet-panel'),
        '钱包生成': document.querySelector('.generate-wallet-panel'),
        '靓号生成': document.querySelector('.mining-panel'),
        '区块浏览': document.querySelector('.blocks-panel'),
        '钱包监控': document.querySelector('.wallet-monitor-panel')
    };

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const panelName = link.querySelector('span').textContent;
            const targetPanel = panels[panelName];

            if (targetPanel) {
                // 更新导航状态
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // 隐藏所有面板
                Object.values(panels).forEach(panel => {
                    if (panel) panel.style.display = 'none';
                });

                // 显示目标面板
                targetPanel.style.display = 'block';

                // 处理区块浏览器的特殊逻辑
                if (panelName === '区块浏览') {
                    isBlocksPanelVisible = true;
                    isMonitoringBlocks = true;
                    initializeBlockMonitor();
                } else {
                    isBlocksPanelVisible = false;
                    // 如果离开区块浏览页面，停止监控
                    if (isMonitoringBlocks) {
                        stopBlockMonitor();
                    }
                }

                // 处理钱包监控的特殊逻辑
                if (panelName === '钱包监控') {
                    if (window.walletMonitor) {
                        window.walletMonitor.startMonitoring();
                    }
                } else {
                    if (window.walletMonitor) {
                        window.walletMonitor.stopMonitoring();
                    }
                }
            }
        });
    });
}

// 添加页面可见性检测
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // 页面不可见时停止监控
        if (isMonitoringBlocks) {
            stopBlockMonitor();
        }
    } else {
        // 页面可见且在区块浏览页面时恢复监控
        if (isBlocksPanelVisible) {
            isMonitoringBlocks = true;
            initializeBlockMonitor();
        }
    }
});

// 添加页面卸载事件处理
window.addEventListener('beforeunload', () => {
    stopBlockMonitor();
});

// 批量获取区块信息
async function batchGetBlocks(startBlock, count) {
    try {
        // 构建批量请求参数
        const requests = [];
        for (let i = 0; i < count; i++) {
            const blockNum = startBlock - i;
            if (blockNum < 0) break;
            requests.push(blockNum);
        }

        // 使用 Promise.all 并发请求所有区块
        const blocks = await Promise.all(
            requests.map(async (blockNum) => {
                try {
                    const block = await tronWeb.trx.getBlock(blockNum);
                    return {
                        number: blockNum,
                        block,
                        success: true
                    };
                } catch (error) {
                    console.error(`获取区块 ${blockNum} 失败:`, error);
                    return {
                        number: blockNum,
                        success: false
                    };
                }
            })
        );

        return blocks.filter(b => b.success);
    } catch (error) {
        console.error('批量获取区块失败:', error);
        return [];
    }
}

// 更新区块信息
async function updateBlockInfo() {
    const blockInfo = document.getElementById('blockInfo');
    const startBlock = latestBlock - (currentPage - 1) * blocksPerPage;
    
    try {
        // 批量获取区块
        const blocks = await batchGetBlocks(startBlock, blocksPerPage);
        
        // 生成区块HTML
        const blocksHtml = blocks.map((blockData, index) => {
            const block = blockData.block;
            const blockNum = blockData.number;
            const timestamp = new Date(block.block_header.raw_data.timestamp).toLocaleString();
            const txCount = block.transactions ? block.transactions.length : 0;
            const isNewBlock = blockNum === lastNewBlock;
            
            return `
                <div class="block-item">
                    <div class="block-header">
                        <div class="block-title">
                            <span class="block-index">#${index + 1}</span>
                            <span class="block-number">区块高度: ${blockNum}</span>
                            ${isNewBlock ? '<span class="new-block-badge">最新</span>' : ''}
                        </div>
                        <span class="block-time">${timestamp}</span>
                    </div>
                    <div class="block-details">
                        <div class="detail-item">
                            <span class="label">交易数:</span>
                            <span class="value">${txCount}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">父哈希:</span>
                            <span class="value">${block.block_header.raw_data.parentHash}</span>
                        </div>
                        <a href="https://tronscan.org/#/block/${blockNum}" target="_blank" class="block-link">
                            在 TronScan 查看 <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                </div>
            `;
        }).join('');
        
        blockInfo.innerHTML = blocksHtml;

        // 移除旧的"最新"标记
        setTimeout(() => {
            const badges = document.querySelectorAll('.new-block-badge');
            badges.forEach(badge => {
                badge.classList.add('fade-out');
                setTimeout(() => badge.remove(), 300);
            });
        }, 1000);
        
        // 更新分页按钮状态
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = startBlock - blocksPerPage < 0;
        
        // 更新页码信息
        document.getElementById('pageInfo').textContent = `第 ${currentPage} 页`;
        
    } catch (error) {
        console.error('更新区块信息失败:', error);
        blockInfo.innerHTML = '<div class="error">获取区块信息失败，请稍后重试</div>';
    }
}

// 获取最新区块
async function getLatestBlock() {
    try {
        const block = await tronWeb.trx.getCurrentBlock();
        if (block && block.block_header) {
            const newBlockNum = block.block_header.raw_data.number;
            if (newBlockNum !== latestBlock) {
                lastNewBlock = newBlockNum;
                latestBlock = newBlockNum;
                await updateBlockInfo();
            }
        }
    } catch (error) {
        console.error('获取最新区块失败:', error);
    }
}

// 监控区块
async function monitorBlocks() {
    if (!isMonitoringBlocks) return;

    try {
        const newBlock = await tronWeb.trx.getCurrentBlock();
        if (newBlock && newBlock.block_header) {
            const newBlockNum = newBlock.block_header.raw_data.number;
            if (newBlockNum > latestBlock) {
                lastNewBlock = newBlockNum; // 记录最新区块号
                latestBlock = newBlockNum;
                if (currentPage === 1) { // 只在第一页时自动更新
                    await updateBlockInfo();
                }
            }
        }
    } catch (error) {
        console.error('监控区块失败:', error);
    }
}

// 更新倒计时
function updateCounter() {
    if (!isMonitoringBlocks) return;

    const counter = document.getElementById('refreshCounter');
    let count = parseInt(counter.textContent);
    
    if (count > 1) {
        counter.textContent = count - 1;
    } else {
        counter.textContent = '3';
        monitorBlocks();
    }
}

// 事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 监听显示条数变化
    document.getElementById('blockCount').addEventListener('change', function() {
        blocksPerPage = parseInt(this.value);
        currentPage = 1; // 重置到第一页
        initializeBlockMonitor(); // 重新初始化
    });

    // 监听分页按钮点击
    document.getElementById('prevPage').addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            updateBlockInfo();
        }
    });

    document.getElementById('nextPage').addEventListener('click', function() {
        currentPage++;
        updateBlockInfo();
    });
});

// 设置定时器
setInterval(updateCounter, 1000); 