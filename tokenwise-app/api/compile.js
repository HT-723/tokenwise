// api/compile.js (简化版，临时使用)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, format } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  // 生成 system prompt（完整复制之前的函数）
  function generateSystemPrompt(format) {
    let formatInstructions = '';
    if (format === 'minimal') {
      formatInstructions = '【极致精简模式】用最少字符表达核心意图，用·分隔关键词，绝对不增加任何冗余。';
    } else if (format === 'structured') {
      formatInstructions = '【结构化模式】用冒号分隔的键值对，多个字段用·连接，如“动作:写邮件·收件人:老板”。';
    } else if (format === 'json') {
      formatInstructions = '【JSON模式】输出标准JSON格式，但只用于机器解析场景。';
    } else {
      formatInstructions = '【智能自动模式】根据输入长度自动选择最优格式：短文本用极简，长文本用结构化。';
    }

    return `你是一个智能语义编译引擎。${formatInstructions}

【核心规则】
1. 删除所有修饰词：我想、请你、帮我、最好、大概、一点、简单、好用、想要、需要等
2. 保留核心意图和关键实体（人名、时间、数字、工具、地点）
3. 用最短的方式表达相同意思，能用符号不用文字
4. 多个并列项用 / 分隔，多个子任务用 · 分隔
5. 绝对不增加任何冗余字符，包括不必要的空格和标点

【示例】
输入：我想做一个APP，帮助养猫的人记录喂食、驱虫和疫苗时间，要简单好用，最好有提醒功能。
输出：做APP·养猫记录·喂食/驱虫/疫苗·提醒

输入：写一封邮件给老板，主题是下周请年假，从周一到周五
输出：写邮件→老板·主题:下周请年假·时间:周一至周五

输入：帮我查一下明天北京到上海的机票，要东航的，价格低于1000元
输出：查机票·北京→上海·明天·东航·<1000元

输入：给我做一个Python脚本，读取当前文件夹所有csv文件，合并成一个，并删除重复行
输出：Python脚本·合并CSV·当前目录·去重

【重要】只输出编译后的指令，不要任何解释、不要多余空格、不要换行`;
  }

  try {
    const systemPrompt = generateSystemPrompt(format || 'auto');

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

    const compiled = data.choices[0].message.content.trim();

    // 返回结果（带模拟剩余次数，让前端正常显示）
    res.status(200).json({
      compiled,
      remaining: 19,  // 模拟剩余次数
      limit: 20
    });

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}
