// 钱包生成功能
async function generateNewWallet() {
    const resultDiv = document.getElementById('generatedWallet');
    const wordCount = parseInt(document.getElementById('mnemonicLength').value);
    
    try {
        // 生成随机熵
        const entropy = wordCount === 24 ? 32 : 16; // 24词需要32字节熵，12词需要16字节熵
        const randomBytes = new Uint8Array(entropy);
        crypto.getRandomValues(randomBytes);
        
        // 生成助记词
        const mnemonic = ethers.utils.entropyToMnemonic(randomBytes);
        
        // 从助记词生成钱包
        const path = "m/44'/195'/0'/0/0"; // TRON 的 BIP44 路径
        const wallet = ethers.Wallet.fromMnemonic(mnemonic, path);
        const privateKey = wallet.privateKey.slice(2); // 移除 '0x' 前缀
        const address = tronWeb.address.fromPrivateKey(privateKey);

        // 显示结果
        resultDiv.innerHTML = `
            <div class="wallet-section">
                <div class="title">助记词 (${wordCount}个单词)</div>
                <div class="content">${mnemonic}</div>
                <div class="warning">请务必安全保管助记词，它是恢复钱包的唯一凭证！</div>
            </div>
            
            <div class="wallet-section">
                <div class="title">私钥</div>
                <div class="content">${privateKey}</div>
            </div>
            
            <div class="wallet-section">
                <div class="title">钱包地址</div>
                <div class="content">
                    ${address}
                    <a href="https://tronscan.org/#/address/${address}" target="_blank" title="在 TronScan 查看">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            </div>
            
            <div class="copy-section">
                <button onclick="copyWalletInfo('${mnemonic}', '${privateKey}', '${address}')" class="generate-btn">
                    <i class="fas fa-copy"></i>
                    复制钱包信息
                </button>
            </div>
        `;
    } catch (error) {
        console.error('钱包生成错误:', error);
        resultDiv.innerHTML = `
            <div class="error">
                生成钱包失败: ${error.message}
            </div>
        `;
    }
}

// 钱包恢复功能
async function recoverWallet() {
    const resultDiv = document.getElementById('recoverResult');
    const keyInput = document.getElementById('keyInput').value.trim();

    try {
        let address = '';
        let privateKey = '';
        let mnemonic = '';
        let inputType = '';

        // 自动判断输入类型
        if (keyInput.match(/^[0-9a-fA-F]{64}$/)) {
            // 输入是64位十六进制，认为是私钥
            inputType = 'privateKey';
            privateKey = keyInput;
            address = tronWeb.address.fromPrivateKey(keyInput);
        } else {
            // 尝试作为助记词处理
            try {
                const words = keyInput.toLowerCase().trim().split(/\s+/);
                if (words.length !== 12 && words.length !== 24) {
                    throw new Error('助记词必须是12个或24个单词');
                }

                // 验证助记词
                try {
                    // 尝试使用助记词生成钱包，如果成功则说明助记词有效
                    ethers.Wallet.fromMnemonic(keyInput);
                    inputType = 'mnemonic';
                    mnemonic = keyInput;
                } catch (e) {
                    throw new Error('无效的助记词格式');
                }

                // 从助记词生成钱包
                const path = "m/44'/195'/0'/0/0";
                const wallet = ethers.Wallet.fromMnemonic(mnemonic, path);
                privateKey = wallet.privateKey.slice(2);
                address = tronWeb.address.fromPrivateKey(privateKey);
            } catch (e) {
                throw new Error(`无效的输入格式。请输入64位十六进制私钥或有效的助记词。\n错误详情: ${e.message}`);
            }
        }

        // 显示恢复结果
        resultDiv.innerHTML = `
            <div class="recovered-wallet-info">
                <div class="wallet-section">
                    ${inputType === 'mnemonic' ? `
                        <div class="title">助记词</div>
                        <div class="content">${mnemonic}</div>
                        <div class="warning">请务必安全保管助记词，它是恢复钱包的唯一凭证！</div>
                    ` : ''}
                    
                    <div class="title">私钥</div>
                    <div class="content">${privateKey}</div>
                    
                    <div class="title">钱包地址</div>
                    <div class="content">
                        ${address}
                        <a href="https://tronscan.org/#/address/${address}" target="_blank" title="在 TronScan 查看">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                </div>
                
                <div class="copy-section">
                    <button onclick="copyRecoveredWalletInfo('${mnemonic}', '${privateKey}', '${address}')" class="generate-btn">
                        <i class="fas fa-copy"></i>
                        复制钱包信息
                    </button>
                </div>
            </div>
        `;

        // 自动填充地址到搜索框，方便查询余额
        document.getElementById('addressInput').value = address;
    } catch (error) {
        console.error('钱包恢复错误:', error);
        resultDiv.innerHTML = `
            <div class="error">
                ${error.message}
            </div>
        `;
    }
}

// 复制钱包信息
function copyWalletInfo(mnemonic, privateKey, address) {
    const info = mnemonic ? `
助记词: ${mnemonic}
私钥: ${privateKey}
地址: ${address}

警告：请务必安全保管助记词和私钥，不要分享给任何人！
    `.trim() : `
私钥: ${privateKey}
地址: ${address}

警告：请务必安全保管私钥，不要分享给任何人！
    `.trim();
    
    copyToClipboard(info);
}

// 为恢复的钱包添加专门的复制函数
function copyRecoveredWalletInfo(mnemonic, privateKey, address) {
    const info = mnemonic ? `
已恢复的钱包信息：
助记词: ${mnemonic}
私钥: ${privateKey}
地址: ${address}

警告：请务必安全保管助记词和私钥，不要分享给任何人！
    `.trim() : `
已恢复的钱包信息：
私钥: ${privateKey}
地址: ${address}

警告：请务必安全保管私钥，不要分享给任何人！
    `.trim();
    
    copyToClipboard(info);
} 