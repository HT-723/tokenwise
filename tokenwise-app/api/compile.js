// api/compile.js
import { Redis } from '@upstash/redis';  // 用于跨请求持久化计数
import { createClient } from '@vercel/kv'; // 或使用 Vercel KV

// 初始化 Redis（免费版：https://upstash.com/）
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 或者使用 Vercel KV（需在 Vercel 项目设置中启用）
// const kv = createClient({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

// 每日免费次数限制
const DAILY_FREE_LIMIT = 20;

export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 获取客户端 IP（注意 Vercel 的 headers）
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `rate:${ip}:${today}`;

  try {
    // 1. 限流检查
    const current = await redis.incr(key);
    if (current === 1) {
      // 第一次访问，设置过期时间为明天凌晨
      const expireAt = new Date();
      expireAt.setUTCHours(24, 0, 0, 0);
      const ttl = Math.floor((expireAt - new Date()) / 1000);
      await redis.expire(key, ttl);
    }

    if (current > DAILY_FREE_LIMIT) {
      return res.status(429).json({ 
        error: 'Daily free limit exceeded. Please upgrade to continue.',
        used: current - 1,
        limit: DAILY_FREE_LIMIT
      });
    }

    // 2. 转发请求到 DeepSeek
    const { prompt, format } = req.body; // 前端传来的参数
    const systemPrompt = generateSystemPrompt(format); // 你可以复用前端的 systemPrompt 构建逻辑

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 150
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    // 3. 返回结果（包括剩余次数信息）
    res.status(200).json({
      compiled: data.choices[0].message.content,
      remaining: DAILY_FREE_LIMIT - current,
      limit: DAILY_FREE_LIMIT
    });

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}

// 辅助函数：生成 system prompt（可从前端拷贝过来）
function generateSystemPrompt(format) {
  // 复制你前端 callCompileAPI 中的 formatInstructions 逻辑
  // 为了简洁，此处省略，你可以直接复用
}