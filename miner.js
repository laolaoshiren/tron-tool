// 从主页面获取库的实例
self.CryptoJS = self.parent.CryptoJS;
self.elliptic = self.parent.elliptic;
self.bs58 = self.parent.bs58;

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
        
        // 3. 计算 Keccak-256 哈希
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
    var batchSize = e.data.batchSize || 1000;
    
    mining = true;
    attempts = 0;

    function mine() {
        if (!mining) return;

        try {
            for (var i = 0; i < batchSize; i++) {
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

            attempts += batchSize;
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