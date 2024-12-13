// UI 相关功能
document.addEventListener('DOMContentLoaded', function() {
    // 初始化靓号选项
    initializePatternOptions();
    
    // 检查浏览器兼容性
    checkBrowserCompatibility();
    
    // 清除输入框内容（安全考虑）
    document.getElementById('keyInput').addEventListener('blur', function() {
        setTimeout(() => {
            this.value = '';
        }, 1000);
    });
    
    // 添加导航功能
    initializeNavigation();

    // 启动区块监控（仅在切换到区块浏览时才会实际开始监控）
    isMonitoringBlocks = false;
});

function initializePatternOptions() {
    const patternSelect = document.getElementById('pattern');
    const options = {
        '双字符': [
            {value: 'aa', label: '双A (尾号AA)'},
            {value: 'bb', label: '双B (尾号BB)'},
            {value: 'cc', label: '双C (尾号CC)'},
            {value: 'dd', label: '双D (尾号DD)'},
            {value: 'ee', label: '双E (尾号EE)'},
            {value: 'ff', label: '双F (尾号FF)'}
        ],
        '三字符': [
            {value: 'aaa', label: '三A (尾号AAA)'},
            {value: 'bbb', label: '三B (尾号BBB)'},
            {value: 'ccc', label: '三C (尾号CCC)'},
            {value: 'ddd', label: '三D (尾号DDD)'},
            {value: 'eee', label: '三E (尾号EEE)'},
            {value: 'fff', label: '三F (尾号FFF)'}
        ],
        '数字组合': [
            {value: '888', label: '尾号888'},
            {value: '666', label: '尾号666'},
            {value: '000', label: '尾号000'},
            {value: '999', label: '尾号999'},
            {value: '123', label: '尾号123'},
            {value: '234', label: '尾号234'},
            {value: '345', label: '尾号345'}
        ]
    };

    for (const [group, items] of Object.entries(options)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            optgroup.appendChild(option);
        });
        
        patternSelect.appendChild(optgroup);
    }
}

function checkBrowserCompatibility() {
    if (typeof Worker === 'undefined') {
        alert('您的浏览器不支持 Web Worker，挖矿功能可能会导致页面卡顿');
    }
    
    if (typeof ethers === 'undefined') {
        console.error('ethers 库加载失败');
        document.getElementById('result').innerHTML = '系统初始化失败，请刷新页面重试';
    }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showCopyTip();
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showCopyTip();
        } catch (e) {
            alert('复制失败，请手动复制');
        }
        document.body.removeChild(textarea);
    }
}

function showCopyTip() {
    const copyTip = document.getElementById('copyTip');
    copyTip.style.display = 'block';
    setTimeout(() => {
        copyTip.style.display = 'none';
    }, 2000);
}

// 添加导航初始化函数
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-links li');
    const panels = {
        '钱包恢复': document.querySelector('.wallet-panel'),
        '钱包生成': document.querySelector('.generate-wallet-panel'),
        '靓号生成': document.querySelector('.mining-panel'),
        '区块浏览': document.querySelector('.blocks-panel'),
        '钱包监控': document.querySelector('.wallet-monitor-panel')
    };

    // 初始状态：只显示钱包恢复
    Object.values(panels).forEach(panel => {
        if (panel) {
            panel.style.display = panel === panels['钱包恢复'] ? 'block' : 'none';
        }
    });

    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            // 移除所有 active 类
            navLinks.forEach(l => l.classList.remove('active'));
            // 添加当前 active 类
            this.classList.add('active');

            // 获取点击的面板名称
            const panelName = this.querySelector('span').textContent;
            
            // 隐藏所有面板
            Object.values(panels).forEach(panel => {
                if (panel) {
                    panel.style.display = 'none';
                }
            });
            
            // 显示选中的面板
            if (panels[panelName]) {
                panels[panelName].style.display = 'block';
                
                // 如果是区块浏览，立即初始化并开始监控
                if (panelName === '区块浏览') {
                    isMonitoringBlocks = true;
                    initializeBlockMonitor();
                } else if (panelName === '钱包监控') {
                    // 如果是钱包监控面板，初始化监控功能
                    if (window.walletMonitor) {
                        window.walletMonitor.startMonitoring();
                    }
                } else {
                    isMonitoringBlocks = false;
                }

                // 如果切换面板，清除搜索结果
                const searchResultPanel = document.querySelector('.search-result-panel');
                if (searchResultPanel) {
                    searchResultPanel.style.display = 'none';
                }
            }
        });
    });
} 