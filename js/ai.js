// OpenAI 兼容接口客户端（原型版直连；正式版改为 Cloudflare Worker 中转，Key 存 Supabase）
import { getSettings } from './store.js';

export function hasKey() { return !!getSettings().apiKey; }

async function chat(messages, { json = false, temperature = 0.7, maxTokens = 900 } = {}) {
  const { apiKey, baseUrl, model } = getSettings();
  if (!apiKey) {
    const e = new Error('尚未配置 API Key，请先到「设置」页填写');
    e.code = 'NO_KEY';
    throw e;
  }
  let res;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, messages,
        temperature,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (err) {
    const e = new Error('网络无法连接 AI 接口（国内直连需代理；后续将走 Worker 中转）');
    e.cause = err;
    throw e;
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch {}
    throw new Error(`AI 接口返回 ${res.status}${detail ? '：' + detail : ''}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ---------- 口语考官 ----------
export const EXAMINER_SYSTEM = `你是资深 IELTS Speaking 考官，与考生进行实时对练。
规则：
1. 一次只问一个问题，按真实考试 Part 1 → Part 2 → Part 3 推进，根据考生回答自然追问。
2. Part 2 提示考生有 1 分钟准备、说 1-2 分钟。
3. 考生回答中途绝不纠正、不打断。
4. 用自然的日常英语提问，措辞清晰，问题一次说完。
5. 当考生明确要求"评分/结束"时，按 Fluency and Coherence、Lexical Resource、Grammar Range and Accuracy、Pronunciation(可根据转写文本推断) 四项给出 Band 区间（如 6.0-6.5），指出最该优先修复的 3 个问题，每个问题给 2 个替代表达，最后用中文总结。全程用英语进行，仅最终评分报告可用中文。`;

export function examinerReply(history) {
  return chat([{ role: 'system', content: EXAMINER_SYSTEM }, ...history], { temperature: 0.8, maxTokens: 500 });
}

// ---------- 单词联想记忆 ----------
export async function generateMnemonic(term, context) {
  const sys = `你是雅思词汇老师，擅长"联想记忆法"（词根词缀 + 发音联想 + 画面/故事联想 + 同义反义网）。
根据给定英文词块和语境，输出严格 JSON，字段：
meaning: 简洁中文释义（含词性）；
mnemonic: 联想记忆讲解（中文，2-4句，融合词根或发音或画面，具体生动，不要空话）；
association: 一句话画面联想（中文，离奇好记）；
example: 一个地道英文例句（不超过18词，体现雅思场景）。
只输出 JSON。`;
  const out = await chat([
    { role: 'system', content: sys },
    { role: 'user', content: `词块：${term}\n原文语境：${context || '（无）'}` },
  ], { json: true, temperature: 0.6, maxTokens: 600 });
  try {
    return JSON.parse(out.replace(/```json|```/g, ''));
  } catch {
    return { meaning: '', mnemonic: out, association: '', example: '' };
  }
}

// ---------- 写作反馈（第二阶段增强用，原型先提供入口） ----------
export function writingFeedback(essay, prompt) {
  return chat([
    { role: 'system', content: '你是雅思写作考官。先不要整篇重写；按官方四项标准各指出最影响分数的1个问题、1个优点、1个可执行修改；然后只重写最弱的一段并解释；最后用中文给2个追问，迫使论证推进到机制/证据/边界条件。' },
    { role: 'user', content: `题目：${prompt}\n\n作文：\n${essay}` },
  ], { temperature: 0.5, maxTokens: 900 });
}

export async function testKey() {
  const out = await chat([{ role: 'user', content: 'Reply with exactly: OK' }], { maxTokens: 5, temperature: 0 });
  return out;
}
