<template>
  <div class="chat-demo">
    <div class="chat-header">
      <h2>🤖 合同智能助手 - 测试</h2>
      <span class="status" :class="{ connected: isConnected }">
        {{ isConnected ? '✅ 后端已连接' : '⏳ 连接中...' }}
      </span>
    </div>

    <div class="chat-messages" ref="messageContainer">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message', msg.role]"
      >
        <div class="message-content">{{ msg.content }}</div>
      </div>
      <div v-if="isLoading" class="message assistant">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>

    <div class="chat-input">
      <input
        v-model="userInput"
        type="text"
        placeholder="输入消息测试智能体..."
        @keyup.enter="sendMessage"
        :disabled="isLoading"
      />
      <button @click="sendMessage" :disabled="isLoading || !userInput.trim()">
        {{ isLoading ? '发送中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import axios from 'axios';

// 状态
const userInput = ref('');
const isLoading = ref(false);
const isConnected = ref(false);
const messages = ref([
  { role: 'assistant', content: '你好！我是合同智能助手，输入消息测试我吧！' }
]);
const messageContainer = ref<HTMLElement | null>(null);

// 测试后端连接
const testConnection = async () => {
  try {
    const response = await axios.get('/api/agent/health');
    if (response.data) {
      isConnected.value = true;
      messages.value.push({
        role: 'assistant',
        content: '✅ 后端连接成功！现在可以开始对话了。'
      });
    }
  } catch (error) {
    isConnected.value = false;
    messages.value.push({
      role: 'assistant',
      content: '❌ 后端连接失败，请确保后端服务已启动 (npm run dev in backend)'
    });
  }
};

// 发送消息
const sendMessage = async () => {
  const text = userInput.value.trim();
  if (!text || isLoading.value) return;

  // 添加用户消息
  messages.value.push({ role: 'user', content: text });
  userInput.value = '';
  isLoading.value = true;

  // 滚动到底部
  await nextTick();
  scrollToBottom();

  try {
    const response = await axios.post('/api/agent/chat', {
      message: text,
      history: [],
    });

    if (response.data.success) {
      messages.value.push({
        role: 'assistant',
        content: response.data.content
      });
    } else {
      messages.value.push({
        role: 'assistant',
        content: `❌ 错误: ${response.data.error || '未知错误'}`
      });
    }
  } catch (error: any) {
    console.error('请求失败:', error);
    messages.value.push({
      role: 'assistant',
      content: `❌ 请求失败: ${error.message || '网络错误'}`
    });
  } finally {
    isLoading.value = false;
    await nextTick();
    scrollToBottom();
  }
};

// 滚动到底部
const scrollToBottom = () => {
  if (messageContainer.value) {
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
  }
};

// 组件挂载时测试连接
onMounted(() => {
  testConnection();
});
</script>

<style scoped>
.chat-demo {
  max-width: 700px;
  margin: 40px auto;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  background: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-header {
  padding: 20px 24px;
  background: #2d3748;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.status {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 20px;
  background: #4a5568;
}

.status.connected {
  background: #38a169;
}

.chat-messages {
  height: 450px;
  padding: 20px;
  overflow-y: auto;
  background: #f7fafc;
}

.message {
  margin-bottom: 16px;
  display: flex;
}

.message.user {
  justify-content: flex-end;
}

.message.user .message-content {
  background: #3182ce;
  color: white;
  border-radius: 18px 18px 4px 18px;
}

.message.assistant .message-content {
  background: white;
  color: #1a202c;
  border-radius: 18px 18px 18px 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.message-content {
  max-width: 80%;
  padding: 12px 18px;
  line-height: 1.6;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.typing-indicator {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  background: white;
  border-radius: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #4a5568;
  border-radius: 50%;
  animation: typing 1.4s infinite both;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.2);
    opacity: 1;
  }
}

.chat-input {
  display: flex;
  padding: 16px 20px;
  gap: 12px;
  border-top: 1px solid #e2e8f0;
  background: white;
}

.chat-input input {
  flex: 1;
  padding: 10px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 24px;
  outline: none;
  font-size: 14px;
  transition: border-color 0.2s;
}

.chat-input input:focus {
  border-color: #2d3748;
}

.chat-input input:disabled {
  background: #f7fafc;
  cursor: not-allowed;
}

.chat-input button {
  padding: 10px 28px;
  background: #2d3748;
  color: white;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.chat-input button:hover:not(:disabled) {
  background: #1a202c;
}

.chat-input button:disabled {
  background: #a0aec0;
  cursor: not-allowed;
  opacity: 0.6;
}
</style>