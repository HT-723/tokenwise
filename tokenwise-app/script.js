// 配置区 ———— 后端代理地址（默认相对路径）
const API_ENDPOINT = '/api/compile';  // 使用 Vercel 的自动代理

// 每日免费次数
const DAILY_FREE_LIMIT = 20;

// 输出压缩比例基准（基于学术研究）
const OUTPUT_COMPRESSION_BASE = {
    MIN: 0.2,
    MAX: 0.6,
    DEFAULT: 0.4
};

// 工具函数：估算 token 数（中文1字≈1，英文1词≈1.3）
function estimateTokens(text) {
    if (!text) return 0;
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = text.split(/[\s\.,!?;:\(\)\[\]{}"']+/).filter(w => w.length > 0 && /[a-zA-Z]/.test(w));
    const otherChars = text.length - chineseChars.length - englishWords.join('').length;
    return Math.ceil(chineseChars.length * 1 + englishWords.length * 1.3 + otherChars * 0.5);
}

// 根据输入压缩率估算输出压缩率
function estimateOutputCompression(inputCompressionRate) {
    const base = 0.2;
    const k = 0.3;
    let estimated = base + k * Math.log(1 + inputCompressionRate * 2);
    return Math.min(OUTPUT_COMPRESSION_BASE.MAX, Math.max(OUTPUT_COMPRESSION_BASE.MIN, estimated));
}

// 更新原始 token 显示
function updateRawTokenEstimate() {
    const input = document.getElementById('userInput').value;
    const tokenCount = estimateTokens(input);
    document.getElementById('rawTokenEstimate').textContent = tokenCount;
}

// 同步滑块和输入框
function syncMonthlyCalls() {
    const slider = document.getElementById('monthlyCallsSlider');
    const input = document.getElementById('monthlyCallsInput');
    if (!slider || !input) return;
    
    slider.addEventListener('input', function() {
        input.value = slider.value;
    });
    
    input.addEventListener('input', function() {
        let val = parseInt(input.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        if (val < 1000) val = 1000;
        slider.value = val;
    });
}

// 获取当前月调用量
function getMonthlyCalls() {
    const input = document.getElementById('monthlyCallsInput');
    return input ? parseInt(input.value, 10) || 10000 : 10000;
}

// 显示剩余次数
function updateRemainingDisplay(remaining, limit) {
    const el = document.getElementById('remaining-counter');
    if (el) {
        el.textContent = `今日剩余：${remaining}次`;
        if (remaining <= 5) {
            el.style.backgroundColor = '#f97316';
        } else {
            el.style.backgroundColor = '#2563eb';
        }
    }
}

// 调用后端代理
async function callCompileAPI(originalText) {
    const formatSelect = document.getElementById('outputFormat');
    const selectedFormat = formatSelect ? formatSelect.value : 'auto';

    const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: originalText,
            format: selectedFormat
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
            throw new Error(`❌ 今日免费次数已用完 (${errorData.used}/${errorData.limit})，请明天再来或升级。`);
        }
        throw new Error(errorData.error || `请求失败 (HTTP ${response.status})`);
    }

    const data = await response.json();
    const compiled = data.compiled;

    // 显示剩余次数
    if (data.remaining !== undefined) {
        updateRemainingDisplay(data.remaining, data.limit);
    }

    // 本地 token 估算
    const rawTokens = estimateTokens(originalText);
    const compiledTokens = estimateTokens(compiled);
    const inputSavedPercent = ((rawTokens - compiledTokens) / rawTokens * 100).toFixed(1);

    const inputRate = (rawTokens - compiledTokens) / rawTokens;
    const outputRate = estimateOutputCompression(inputRate);
    const rawOutputTokens = Math.ceil(rawTokens * 2);
    const compiledOutputTokens = Math.ceil(rawOutputTokens * (1 - outputRate));
    const outputSavedPercent = ((rawOutputTokens - compiledOutputTokens) / rawOutputTokens * 100).toFixed(1);

    return {
        original: originalText,
        compiled,
        rawTokens,
        compiledTokens,
        rawOutputTokens,
        compiledOutputTokens,
        inputSavedPercent,
        outputSavedPercent
    };
}

// 计算省钱估算
function calculateMoneySaved(rawInputTokens, compiledInputTokens, rawOutputTokens, compiledOutputTokens, monthlyCalls = 10000) {
    const totalRawInput = rawInputTokens * monthlyCalls;
    const totalRawOutput = rawOutputTokens * monthlyCalls;
    const totalCompiledInput = compiledInputTokens * monthlyCalls;
    const totalCompiledOutput = compiledOutputTokens * monthlyCalls;

    const INPUT_PRICE = 1.0;
    const OUTPUT_PRICE = 2.0;

    const rawCost = (totalRawInput / 1e6) * INPUT_PRICE + (totalRawOutput / 1e6) * OUTPUT_PRICE;
    const compiledCost = (totalCompiledInput / 1e6) * INPUT_PRICE + (totalCompiledOutput / 1e6) * OUTPUT_PRICE;
    
    const inputSaved = ((totalRawInput - totalCompiledInput) / 1e6) * INPUT_PRICE;
    const outputSaved = ((totalRawOutput - totalCompiledOutput) / 1e6) * OUTPUT_PRICE;
    
    return {
        total: (rawCost - compiledCost).toFixed(2),
        input: inputSaved.toFixed(2),
        output: outputSaved.toFixed(2),
        rawCost: rawCost.toFixed(2),
        compiledCost: compiledCost.toFixed(2),
        savedPercent: ((rawCost - compiledCost) / rawCost * 100).toFixed(1)
    };
}

// 渲染结果到页面
function renderResult(data) {
    document.getElementById('rawTokens').textContent = data.rawTokens;
    document.getElementById('compiledTokens').textContent = data.compiledTokens;
    document.getElementById('savedPercent').textContent = data.inputSavedPercent + '%';
    
    document.getElementById('rawOutputTokens').textContent = data.rawOutputTokens;
    document.getElementById('compiledOutputTokens').textContent = data.compiledOutputTokens;
    document.getElementById('savedOutputPercent').textContent = data.outputSavedPercent + '%';
    
    document.getElementById('originalText').textContent = data.original;
    document.getElementById('compiledText').textContent = data.compiled;

    const monthlyCalls = getMonthlyCalls();
    const moneySaved = calculateMoneySaved(
        data.rawTokens, 
        data.compiledTokens,
        data.rawOutputTokens,
        data.compiledOutputTokens,
        monthlyCalls
    );
    
    document.getElementById('moneySaved').textContent = moneySaved.total;
    document.getElementById('totalSavedPercent').textContent = moneySaved.savedPercent + '%';
    document.getElementById('inputSaved').textContent = moneySaved.input;
    document.getElementById('outputSaved').textContent = moneySaved.output;
    document.getElementById('rawCost').textContent = moneySaved.rawCost;
    document.getElementById('compiledCost').textContent = moneySaved.compiledCost;

    document.getElementById('outputArea').style.display = 'block';
}

// 手动更新省钱估算
function updateMoneyEstimate() {
    const rawInputTokens = parseInt(document.getElementById('rawTokens').textContent, 10);
    const compiledInputTokens = parseInt(document.getElementById('compiledTokens').textContent, 10);
    const rawOutputTokens = parseInt(document.getElementById('rawOutputTokens').textContent, 10);
    const compiledOutputTokens = parseInt(document.getElementById('compiledOutputTokens').textContent, 10);
    
    if (rawInputTokens && compiledInputTokens) {
        const monthlyCalls = getMonthlyCalls();
        const moneySaved = calculateMoneySaved(
            rawInputTokens, 
            compiledInputTokens,
            rawOutputTokens,
            compiledOutputTokens,
            monthlyCalls
        );
        document.getElementById('moneySaved').textContent = moneySaved.total;
        document.getElementById('totalSavedPercent').textContent = moneySaved.savedPercent + '%';
        document.getElementById('inputSaved').textContent = moneySaved.input;
        document.getElementById('outputSaved').textContent = moneySaved.output;
    }
}

// 主流程：点击编译按钮
async function onCompile() {
    const input = document.getElementById('userInput').value.trim();
    if (!input) {
        alert('请输入需求');
        return;
    }

    document.getElementById('loading').style.display = 'block';
    document.getElementById('outputArea').style.display = 'none';
    document.getElementById('error').style.display = 'none';

    try {
        const result = await callCompileAPI(input);
        renderResult(result);
        document.getElementById('loading').style.display = 'none';
    } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = err.message;
    }
}

// 复制编译后指令
function copyCompiled() {
    const compiledText = document.getElementById('compiledText').textContent;
    navigator.clipboard.writeText(compiledText).then(() => {
        alert('已复制到剪贴板');
    }).catch(() => {
        alert('复制失败，请手动选择复制');
    });
}

// 初始化剩余次数显示
function initRemaining() {
    // 初始显示默认值，实际会在第一次编译后更新
    updateRemainingDisplay(DAILY_FREE_LIMIT, DAILY_FREE_LIMIT);
}

// 绑定事件
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('userInput');
    input.addEventListener('input', updateRawTokenEstimate);
    document.getElementById('compileBtn').addEventListener('click', onCompile);
    document.getElementById('copyBtn').addEventListener('click', copyCompiled);
    
    syncMonthlyCalls();
    document.getElementById('updateEstimateBtn').addEventListener('click', updateMoneyEstimate);
    
    initRemaining();
});