import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { config } from "../config/index.js";

const API_KEY = config.deepseek.apiKey;
const BASE_URL = config.deepseek.baseURL || 'http://127.0.0.1:15721/v1';

console.log('🔑 AgentService - API Key:', API_KEY ? '✅ 已设置' : '❌ 未设置');
console.log('🌐 AgentService - Base URL:', BASE_URL);

const deepseek = createOpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

const SYSTEM_PROMPT = `你是一位专业的合同法律顾问...`;

export async function chat(message, history = []) {
  try {
    const messages = [...history, { role: 'user', content: message }];

    const { text } = await generateText({
      model: deepseek('deepseek-chat'),
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
    });

    return { success: true, content: text };
  } catch (error) {
    console.error('智能体调用失败:', error);
    return { success: false, error: error.message };
  }
}