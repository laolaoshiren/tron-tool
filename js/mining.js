// 挖矿功能
let isMining = false;
let foundWallets = [];
let miningWorker;

async function startMining() {
    const miningBtn = document.getElementById('miningBtn');
    const statusSpan = document.getElementById('miningStatus');
    const foundDiv = document.getElementById('foundAddresses');
    const pattern = document.getElementById('pattern').value;
    const caseSensitive = document.getElementById('caseSensitive').value === 'true';

    if (isMining) {
        isMining = false;
        miningBtn.innerHTML = '<i class="fas fa-play"></i><span>开始挖矿</span>';
        if (miningWorker) {
            miningWorker.terminate();
        }
        statusSpan.innerHTML = '已停止';
        return;
    }

    isMining = true;
    miningBtn.innerHTML = '<i class="fas fa-stop"></i><span>停止挖矿</span>';
    foundWallets = [];
    const startTime = Date.now();

    console.log('开始挖矿:', { pattern, caseSensitive });

    try {
        console.log('创建 Worker');
        const workerCode = `
            self.importScripts(
                'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
                'https://cdn.jsdelivr.net/npm/elliptic@6.5.4/dist/elliptic.min.js',
                'https://cdn.jsdelivr.net/npm/bs58@5.0.0/dist/bs58.min.js'
            );

            var mining = false;
            var attempts = 0;
            var ec = new elliptic.ec('secp256k1');

            // TRON 地址生成函数
            function generateTronAddress(privateKeyHex) {
                try {
                    var keyPair = ec.keyFromPrivate(privateKeyHex);
                    var pubPoint = keyPair.getPublic();
                    var pubKeyHex = '04' + 
                        pubPoint.x.toString('hex').padStart(64, '0') + 
                        pubPoint.y.toString('hex').padStart(64, '0');
                    
                    var pubKeyHash = CryptoJS.SHA3(
                        CryptoJS.enc.Hex.parse(pubKeyHex.slice(2)),
                        { outputLength: 256 }
                    );
                    
                    var address = pubKeyHash.toString().slice(-40);
                    var addressWithPrefix = '41' + address;
                    
                    var hash1 = CryptoJS.SHA256(
                        CryptoJS.enc.Hex.parse(addressWithPrefix)
                    );
                    var hash2 = CryptoJS.SHA256(hash1);
                    var checksum = hash2.toString().slice(0, 8);
                    
                    var addressBytes = addressWithPrefix + checksum;
                    
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
                            var privateKeyBytes = new Uint8Array(32);
                            crypto.getRandomValues(privateKeyBytes);
                            var privateKey = Array.from(privateKeyBytes)
                                .map(function(b) { return b.toString(16).padStart(2, '0'); })
                                .join('');

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

        console.log('发送参数到 Worker');
        miningWorker.postMessage({
            pattern,
            caseSensitive
        });

        miningWorker.onmessage = function(e) {
            const { type, privateKey, address, attempts } = e.data;

            if (type === 'found') {
                console.log('找到匹配的钱包:', address);
                foundWallets.push({
                    privateKey,
                    address,
                    foundAttempt: attempts
                });

                foundDiv.innerHTML = foundWallets.map((w, index) => `
                    <div class="found-wallet">
                        <div>靓号钱包 #${index + 1} (第 ${w.foundAttempt.toLocaleString()} 次尝试找到)</div>
                        <div>地址: <a href="https://tronscan.org/#/address/${w.address}" target="_blank">${w.address}</a></div>
                        <div>私钥: <span style="color: #666;">${w.privateKey}</span></div>
                        <div class="copy-btn">
                            <button onclick="copyToClipboard(\`地址: ${w.address}\n私钥: ${w.privateKey}\`)">
                                <i class="fas fa-copy"></i> 复制钱包信息
                            </button>
                        </div>
                    </div>
                `).join('');

                if (foundWallets.length >= 5) {
                    console.log('已找到足够的钱包，停止挖矿');
                    isMining = false;
                    miningBtn.innerHTML = '<i class="fas fa-play"></i><span>开始挖矿</span>';
                    miningWorker.terminate();
                    statusSpan.innerHTML += '<br><span style="color: green;">已完成！</span>';
                    return;
                }
            }

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
            miningBtn.innerHTML = '<i class="fas fa-play"></i><span>开始挖矿</span>';
        };

    } catch (error) {
        console.error('创建 Worker 失败:', error);
        statusSpan.innerHTML = '创建工作线程失败，请使用支持 Web Worker 的浏览器';
        isMining = false;
        miningBtn.innerHTML = '<i class="fas fa-play"></i><span>开始挖矿</span>';
    }
} 