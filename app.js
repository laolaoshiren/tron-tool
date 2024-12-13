// 初始化 TronWeb - 使用主网配置（只读模式）
const fullNode = 'https://api.trongrid.io';
const solidityNode = 'https://api.trongrid.io';
const eventServer = 'https://api.trongrid.io';

// USDT 合约地址（TRON 主网）
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// 创建只读模式的 TronWeb 实例
const tronWeb = new TronWeb({
    fullNode: fullNode,
    solidityNode: solidityNode,
    eventServer: eventServer,
});

// 添加 API key 到请求头
tronWeb.setHeader({"TRON-PRO-API-KEY": 'b51b041f-5806-49a8-9d75-07bd17efdf2a'});

// 查询余额
async function getBalance() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '正在查询中...';
    
    try {
        const addressInput = document.getElementById('addressInput');
        const address = addressInput.value.trim();

        // 验证地址是否有效
        if (!tronWeb.isAddress(address)) {
            resultDiv.innerHTML = '请输入有效的 TRON 钱包地址';
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
            // 设置默认地址，解决 owner_address 问题
            tronWeb.setAddress(address);
            
            const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
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

        // 添加 TronScan 链接和显示余额
        resultDiv.innerHTML = `
            钱包地址: <a href="https://tronscan.org/#/address/${address}" target="_blank">${address}</a>
            <br>TRX 余额: ${trxAmount} TRX
            <br>USDT 余额: ${usdtAmount} USDT
        `;
    } catch (error) {
        console.error('查询过程出错:', error);
        resultDiv.innerHTML = `查询出错，请稍后重试。错误信息: ${error.message || '未知错误'}`;
    }
}

// 生成地址
async function generateAddress() {
    const resultDiv = document.getElementById('result');
    const inputType = document.getElementById('inputType').value;
    const keyInput = document.getElementById('keyInput').value.trim();

    try {
        let address = '';
        let privateKey = '';

        if (inputType === 'privateKey') {
            // 处理私钥
            if (!keyInput.match(/^[0-9a-fA-F]{64}$/)) {
                throw new Error('无效的私钥格式，请输入64位十六进制字符');
            }
            privateKey = keyInput;
            address = tronWeb.address.fromPrivateKey(keyInput);
        } else {
            // 处理助记词 - 使用 ethers.js 的 Wallet 功能
            try {
                // 验证助记词
                const wordlist = ethers.wordlists.en;
                const words = keyInput.toLowerCase().trim().split(/\s+/);
                
                if (words.length !== 12 && words.length !== 24) {
                    throw new Error('助记词必须是12个或24个单词');
                }
                
                for (const word of words) {
                    if (!wordlist.getWordIndex(word)) {
                        throw new Error(`无此助记词: ${word}`);
                    }
                }

                // 从助记词生成钱包
                const path = "m/44'/195'/0'/0/0"; // TRON 的 BIP44 路径
                const wallet = ethers.Wallet.fromMnemonic(keyInput, path);
                privateKey = wallet.privateKey.slice(2); // 移除 '0x' 前缀
                address = tronWeb.address.fromPrivateKey(privateKey);
            } catch (e) {
                throw new Error(`助记词错误: ${e.message}`);
            }
        }

        // 显示结果
        resultDiv.innerHTML = `
            生成的地址: <a href="https://tronscan.org/#/address/${address}" target="_blank">${address}</a>
            <br>私钥: <span style="color: #666; font-size: 0.9em;">${privateKey}</span>
            <br><span style="color: red;">警告：请勿在不安全的环境下使用此地址和私钥！</span>
        `;

        // 自动填充地址输入框
        document.getElementById('addressInput').value = address;
    } catch (error) {
        console.error('地址生成错误:', error);
        resultDiv.innerHTML = `生成地址失败: ${error.message}`;
    }
}

// 清除输入框内容（安全考虑）
document.getElementById('keyInput').addEventListener('blur', function() {
    setTimeout(() => {
        this.value = '';
    }, 1000);
});

// 修改挖矿功能，不使用 Web Worker
let isMining = false;
let foundWallets = [];
let miningWorker;

async function startMining() {
    const miningBtn = document.getElementById('miningBtn');
    const statusSpan = document.getElementById('miningStatus');
    const foundDiv = document.getElementById('foundAddresses');
    const pattern = document.getElementById('pattern').value;
    const caseSensitive = document.getElementById('caseSensitive').value === 'true';
    const walletType = document.getElementById('walletType').value;

    if (isMining) {
        // 停止挖矿
        isMining = false;
        miningBtn.textContent = '开始挖矿';
        if (miningWorker) {
            miningWorker.terminate();
        }
        statusSpan.innerHTML = '已停止';
        return;
    }

    // 开始挖矿
    isMining = true;
    miningBtn.textContent = '停止挖矿';
    foundWallets = [];
    const startTime = Date.now();

    console.log('开始挖矿:', { pattern, caseSensitive, walletType });

    try {
        console.log('创建 Worker');
        
        // 从页面中获取已加载的库代码
        const workerCode = `
            // 从主页面获取库的代码
            self.importScripts(
                'https://fastly.jsdelivr.net/npm/crypto-js@4.1.1/crypto-js.min.js',
                'https://fastly.jsdelivr.net/npm/elliptic@6.5.4/dist/elliptic.min.js',
                'https://fastly.jsdelivr.net/npm/bs58@5.0.0/dist/bs58.min.js'
            );

            var mining = false;
            var attempts = 0;
            var ec = new elliptic.ec('secp256k1');

            // TRON 地址生成函数
            function generateTronAddress(privateKeyHex) {
                try {
                    // 1. 从私钥生成密钥对
                    var keyPair = ec.keyFromPrivate(privateKeyHex);
                    
                    // 2. 获取公钥点并转换为未压缩格式
                    var pubPoint = keyPair.getPublic();
                    var pubKeyHex = '04' + 
                        pubPoint.x.toString('hex').padStart(64, '0') + 
                        pubPoint.y.toString('hex').padStart(64, '0');
                    
                    // 3. 计算 Keccak-256 哈
                    var pubKeyHash = CryptoJS.SHA3(
                        CryptoJS.enc.Hex.parse(pubKeyHex.slice(2)),
                        { outputLength: 256 }
                    );
                    
                    // 4. 取最后20字节
                    var address = pubKeyHash.toString().slice(-40);
                    
                    // 5. 添加 TRON 地址前缀 (0x41)
                    var addressWithPrefix = '41' + address;
                    
                    // 6. 计算校验和
                    var hash1 = CryptoJS.SHA256(
                        CryptoJS.enc.Hex.parse(addressWithPrefix)
                    );
                    var hash2 = CryptoJS.SHA256(hash1);
                    var checksum = hash2.toString().slice(0, 8);
                    
                    // 7. 组合最终地址字节
                    var addressBytes = addressWithPrefix + checksum;
                    
                    // 8. Base58 编码
                    var words = [];
                    for (var i = 0; i < addressBytes.length; i += 2) {
                        words.push(parseInt(addressBytes.slice(i, i + 2), 16));
                    }
                    var base58Address = 'T' + bs58.encode(new Uint8Array(words));
                    
                    return base58Address;
                } catch (error) {
                    console.error('地址生成错误:', error);
                    return null;
                }
            }

            self.onmessage = function(e) {
                if (e.data.command === 'stop') {
                    mining = false;
                    return;
                }

                var pattern = e.data.pattern;
                var caseSensitive = e.data.caseSensitive;
                
                mining = true;
                attempts = 0;

                function mine() {
                    if (!mining) return;

                    try {
                        for (var i = 0; i < 1000; i++) {
                            // 生成随机私钥
                            var privateKeyBytes = new Uint8Array(32);
                            crypto.getRandomValues(privateKeyBytes);
                            var privateKey = Array.from(privateKeyBytes)
                                .map(function(b) { return b.toString(16).padStart(2, '0'); })
                                .join('');

                            // 生成 TRON 地址
                            var address = generateTronAddress(privateKey);
                            if (address) {
                                var endPart = address.slice(-pattern.length);
                                var isMatch = caseSensitive ? 
                                    (endPart === pattern) : 
                                    (endPart.toLowerCase() === pattern.toLowerCase());

                                if (isMatch) {
                                    self.postMessage({
                                        type: 'found',
                                        privateKey: privateKey,
                                        address: address,
                                        attempts: attempts + i
                                    });
                                }
                            }
                        }

                        attempts += 1000;
                        self.postMessage({
                            type: 'progress',
                            attempts: attempts
                        });

                        setTimeout(mine, 0);
                    } catch (error) {
                        self.postMessage({
                            type: 'error',
                            error: error.message
                        });
                    }
                }

                mine();
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        miningWorker = new Worker(workerUrl);
        console.log('Worker 已创建');

        // 设置状态显示
        const patternText = `${pattern} (${pattern.length}位)`;
        statusSpan.innerHTML = `
            <div style="margin-bottom: 10px;">
                正在挖掘: ${patternText}
                <br>匹配方式: ${caseSensitive ? '完全匹配大小写' : '不区分大小写'}
            </div>
            已尝试: 0 次
            <br>用时: 0 秒
            <br>速度: 0 次/秒
        `;

        // 发送参数到 Worker
        console.log('发送参数到 Worker');
        miningWorker.postMessage({
            pattern,
            caseSensitive
        });

        // 处理 Worker 消息
        miningWorker.onmessage = function(e) {
            const { type, privateKey, address, attempts } = e.data;

            if (type === 'found') {
                console.log('找到匹配的钱包:', address);
                foundWallets.push({
                    privateKey,
                    address,
                    foundAttempt: attempts
                });

                // 更新找到的钱包信息
                foundDiv.innerHTML = foundWallets.map((w, index) => `
                    <div style="margin: 20px 0; padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
                        <div>靓号钱包 #${index + 1} (第 ${w.foundAttempt.toLocaleString()} 次尝试找到)</div>
                        <div>地址: <a href="https://tronscan.org/#/address/${w.address}" target="_blank">${w.address}</a></div>
                        <div>私钥: <span style="color: #666;">${w.privateKey}</span></div>
                        <div style="margin-top: 10px;">
                            <button onclick="copyToClipboard(\`地址: ${w.address}\n私钥: ${w.privateKey}\`)">
                                复制钱包信息
                            </button>
                        </div>
                    </div>
                `).join('');

                if (foundWallets.length >= 5) {
                    console.log('已找到足够的钱包，停止挖矿');
                    isMining = false;
                    miningBtn.textContent = '开始挖矿';
                    miningWorker.terminate();
                    statusSpan.innerHTML += '<br><span style="color: green;">已完成！</span>';
                    return;
                }
            }

            // 更新状态显示
            if (type === 'progress') {
                const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
                const speed = Math.floor(attempts / elapsedTime) || 0;
                statusSpan.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        正在挖掘: ${patternText}
                        <br>匹配方式: ${caseSensitive ? '完全匹配大小写' : '不区分大小写'}
                    </div>
                    已尝试: ${attempts.toLocaleString()} 次
                    <br>用时: ${elapsedTime} 秒
                    <br>速度: ${speed.toLocaleString()} 次/秒
                `;
            }
        };

        miningWorker.onerror = function(error) {
            console.error('Worker 错误:', error);
            statusSpan.innerHTML += '<br><span style="color: red;">挖矿出错，请刷新页面重试</span>';
            isMining = false;
            miningBtn.textContent = '开始挖矿';
        };

    } catch (error) {
        console.error('创建 Worker 失败:', error);
        statusSpan.innerHTML = '创建工作线程失败，请使用支持 Web Worker 的浏览器';
        isMining = false;
        miningBtn.textContent = '开始挖矿';
    }
}

// 修改验证钱包功能
async function verifyWallet(mnemonic, expectedAddress, path) {
    try {
        const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
        const wallet = hdNode.derivePath(path);
        const privateKey = wallet.privateKey.slice(2);
        const address = tronWeb.address.fromPrivateKey(privateKey);
        
        if (address === expectedAddress) {
            alert('验证成功：助记词与地址匹配！\n\n' + 
                  '验证信息：\n' +
                  `地址: ${address}\n` +
                  `私钥: ${privateKey}`);
        } else {
            alert('验证失败：助记词与地址不匹配！\n\n' +
                  '期望地址: ' + expectedAddress + '\n' +
                  '实际地址: ' + address);
        }
    } catch (error) {
        alert('验证失败：' + error.message);
    }
}

// 复制到剪贴板
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        const copyTip = document.getElementById('copyTip');
        copyTip.style.display = 'block';
        setTimeout(() => {
            copyTip.style.display = 'none';
        }, 2000);
    } catch (err) {
        // 如果 clipboard API 失败，使用传统方法
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            const copyTip = document.getElementById('copyTip');
            copyTip.style.display = 'block';
            setTimeout(() => {
                copyTip.style.display = 'none';
            }, 2000);
        } catch (e) {
            alert('复制失败，请手动复制');
        }
        document.body.removeChild(textarea);
    }
} 

// 在文件开头添加全局变量
let lastBlockNum = 0;
let isMonitoringBlocks = true;

// 添加区块监控函数
async function monitorBlocks() {
    if (!isMonitoringBlocks) return;

    try {
        // 获取最新区块
        const block = await tronWeb.trx.getCurrentBlock();
        
        if (block && block.block_header && block.block_header.raw_data) {
            const currentBlockNum = block.block_header.raw_data.number;
            
            // 如果有新区块
            if (currentBlockNum > lastBlockNum) {
                lastBlockNum = currentBlockNum;
                
                // 获取最近10个区块
                const blocks = [];
                for (let i = 0; i < 10; i++) {
                    const blockNum = currentBlockNum - i;
                    if (blockNum < 0) break;
                    
                    const blockInfo = await tronWeb.trx.getBlock(blockNum);
                    if (blockInfo) blocks.push(blockInfo);
                }
                
                // 更新显示
                updateBlockDisplay(blocks);
            }
        }
    } catch (error) {
        console.error('获取区块信息失败:', error);
    }
    
    // 每3秒检查一次
    setTimeout(monitorBlocks, 3000);
}

// 更新区块显示
function updateBlockDisplay(blocks) {
    const blockInfoDiv = document.getElementById('blockInfo');
    
    blockInfoDiv.innerHTML = blocks.map(block => {
        const blockData = block.block_header.raw_data;
        const timestamp = new Date(blockData.timestamp).toLocaleString();
        const txCount = block.transactions ? block.transactions.length : 0;
        const blockHash = block.blockID; // 添加区块哈希
        
        return `
            <div style="
                margin-bottom: 10px;
                padding: 10px;
                background: ${block.block_header.raw_data.number === lastBlockNum ? '#f0f8ff' : 'white'};
                border-radius: 5px;
                border: 1px solid #eee;
            ">
                <div style="font-weight: bold;">区块 #${blockData.number}</div>
                <div style="font-size: 0.9em; color: #666;">
                    时间: ${timestamp}
                    <br>交易数: ${txCount}
                    <br>Block Hash: <span style="word-break: break-all;">${blockHash}</span>
                    <br><a href="https://tronscan.org/#/block/${blockData.number}" target="_blank">在 TronScan 查看</a>
                </div>
            </div>
        `;
    }).join('');
}

// 在页面加载时启动监控
window.addEventListener('load', function() {
    // 原有的 ethers 检查代码
    if (typeof ethers === 'undefined') {
        console.error('ethers 库加载失败');
        document.getElementById('result').innerHTML = '系统初始化失败，请刷新页面重试';
    }
    
    // 启动区块监控
    monitorBlocks();
});

// 在页面关闭或切换时停止监控
window.addEventListener('beforeunload', function() {
    isMonitoringBlocks = false;
}); 