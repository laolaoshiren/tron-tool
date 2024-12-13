// 查询余额功能
async function getBalance() {
    const resultDiv = document.getElementById('result');
    const resultPanel = document.querySelector('.search-result-panel');
    
    resultPanel.style.display = 'block';
    resultDiv.innerHTML = '<div class="loading">正在查询中...</div>';
    
    try {
        const addressInput = document.getElementById('addressInput');
        const address = addressInput.value.trim();

        if (!tronWeb.isAddress(address)) {
            resultDiv.innerHTML = '<div class="error">请输入有效的 TRON 钱包地址</div>';
            return;
        }

        // 查询 TRX 余额
        let trxAmount = '0';
        try {
            const trxBalance = await tronWeb.trx.getBalance(address);
            trxAmount = tronWeb.fromSun(trxBalance);
        } catch (trxError) {
            console.error('TRX 余额查询失败:', trxError);
            trxAmount = '查询失败';
        }

        // 查询 USDT 余额
        let usdtAmount = '0.00';
        try {
            tronWeb.setAddress(address);
            const contract = await tronWeb.contract().at(CONFIG.usdtContract);
            const usdtBalance = await contract.balanceOf(address).call({
                from: address
            });
            
            if (usdtBalance) {
                usdtAmount = (parseFloat(usdtBalance.toString()) / 1e6).toFixed(2);
            }
        } catch (usdtError) {
            console.error('USDT 余额查询失败:', usdtError);
            usdtAmount = '查询失败';
        }

        // 检查是否已在监控列表中
        const isMonitored = window.walletMonitor && 
            window.walletMonitor.wallets.some(w => w.address === address);

        // 使用新的布局显示结果
        resultDiv.innerHTML = `
            <div class="wallet-info">
                <div class="label">钱包地址:</div>
                <div class="value address">
                    <span class="address-text">${address}</span>
                    <a href="https://tronscan.org/#/address/${address}" target="_blank" title="在 TronScan 查看">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
                
                <div class="label">TRX 余额:</div>
                <div class="value balance">${trxAmount} TRX</div>
                
                <div class="label">USDT 余额:</div>
                <div class="value balance">${usdtAmount} USDT</div>

                <button 
                    onclick="addToMonitor('${address}')" 
                    class="add-to-monitor-btn"
                    ${isMonitored ? 'disabled' : ''}
                    title="${isMonitored ? '该钱包已在监控列表中' : '添加到监控列表'}"
                >
                    <i class="fas fa-eye"></i>
                    ${isMonitored ? '已在监控列表' : '添加到监控'}
                </button>
            </div>
        `;
    } catch (error) {
        console.error('查询过程出错:', error);
        resultDiv.innerHTML = `
            <div class="error">
                查询出错，请稍后重试。
                <br>错误信息: ${error.message || '未知错误'}
            </div>
        `;
    }
}

// 添加到监控列表的函数
async function addToMonitor(address) {
    try {
        if (window.walletMonitor) {
            // 显示备注输入对话框
            const modal = document.getElementById('addWalletModal');
            const addressInput = document.getElementById('walletAddress');
            const noteInput = document.getElementById('walletNote');
            
            // 预填充地址
            addressInput.value = address;
            addressInput.disabled = true; // 禁用地址输入，因为是从搜索结果添加的
            noteInput.value = '';
            noteInput.focus();
            
            modal.style.display = 'block';

            // 更新按钮状态
            const btn = document.querySelector('.add-to-monitor-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-eye"></i> 添加中...';
            }
        }
    } catch (error) {
        alert(error.message);
    }
} 