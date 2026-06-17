<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useVoiceAgent } from './composables/useVoiceAgent';
import type { AgentState } from './composables/useVoiceAgent';

const SYSTEM_PROMPT = `你是一个专业的游戏攻略助手。请为玩家解答有关各种游戏的问题，包括角色配队、关卡攻略、装备推荐等。请保持回答简洁易懂，且利于语音播报。`;

const SAMPLE_QUESTIONS = [
  '原神神里绫华怎么配队？',
  '艾尔登法环怎么击败女武神？',
  '王者荣耀当前版本的强势英雄有哪些？',
  '黑神话悟空第一关怎么过？',
];

const apiKey = ref(localStorage.getItem('gemini_api_key') || '');
const showSettings = ref(false);
const tempKey = ref('');
const textQuery = ref('');

// Expose apiKey as an object with value for hook compatibility
const geminiApiKeyRef = computed(() => ({ value: apiKey.value }));

const {
  state,
  wakeWord,
  transcript,
  aiResponse,
  error,
  startAgent,
  stopAgent,
  triggerManualQuery,
  queryGemini,
} = useVoiceAgent(geminiApiKeyRef, SYSTEM_PROMPT);

// Watch for API Key change
watch(apiKey, (newVal) => {
  tempKey.value = newVal;
});
tempKey.value = apiKey.value;

const saveApiKey = () => {
  localStorage.setItem('gemini_api_key', tempKey.value);
  apiKey.value = tempKey.value;
  showSettings.value = false;
};

const handleTextSearchSubmit = () => {
  if (!textQuery.value.trim() || state.value === 'thinking') return;
  queryGemini(textQuery.value);
  textQuery.value = '';
};

const getStateText = (stateVal: AgentState) => {
  switch (stateVal) {
    case 'idle':
      return '已关闭语音助手';
    case 'listening_for_wake':
      return `正在监听唤醒词（说“${wakeWord.value}”唤醒我）`;
    case 'listening_for_query':
      return '正在聆听您的指令...';
    case 'thinking':
      return '正在查阅攻略中...';
    case 'speaking':
      return '正在为您语音播报...';
    case 'disabled':
      return '浏览器语音不可用（不影响键盘输入）';
    default:
      return '状态未知';
  }
};
</script>

<template>
  <div className="container">
    <header className="header">
      <div className="logo-container">
        <span className="logo-icon">🎮</span>
        <span className="logo-text">GameAssistant</span>
      </div>
      <button className="settings-btn" @click="showSettings = !showSettings">
        ⚙️ 设置 API
      </button>
    </header>

    <!-- Settings Modal -->
    <div v-if="showSettings" className="modal-overlay">
      <div className="settings-modal">
        <h2>配置大模型 API</h2>
        <p className="modal-desc">此项目完全运行在您的浏览器本地，API 密钥仅保存在您的本地浏览器中，绝不会上传泄露。</p>
        <div className="input-group">
          <label>Gemini API Key</label>
          <input
            type="password"
            placeholder="请输入以 AIzaSy 开头的 Gemini API Key"
            v-model="tempKey"
          />
          <span className="key-tip">
            可在 <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a> 免费获取。
          </span>
        </div>
        <div className="input-group">
          <label>自定义唤醒词</label>
          <input
            type="text"
            v-model="wakeWord"
          />
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" @click="showSettings = false">取消</button>
          <button className="btn-save" @click="saveApiKey">保存</button>
        </div>
      </div>
    </div>

    <main className="main">
      <!-- State visual indicator / Avatar -->
      <div :class="['avatar-container', `state-${state}`]">
        <div className="avatar-pulse-1"></div>
        <div className="avatar-pulse-2"></div>
        <div className="avatar-sphere" @click="state === 'idle' ? startAgent() : stopAgent()">
          <span v-if="state === 'idle'">🔇</span>
          <span v-else-if="state === 'listening_for_wake'">🎙️</span>
          <span v-else-if="state === 'listening_for_query'">👂</span>
          <span v-else-if="state === 'thinking'">🧠</span>
          <span v-else-if="state === 'speaking'">🔊</span>
          <span v-else-if="state === 'disabled'">❌</span>
        </div>
      </div>

      <h2 className="agent-status">{{ getStateText(state) }}</h2>

      <!-- Start / Stop Toggle -->
      <div className="control-panel">
        <button v-if="state === 'idle'" className="btn-primary" @click="startAgent()">
          开启语音唤醒
        </button>
        <button v-else className="btn-danger" @click="stopAgent()">
          关闭语音助手
        </button>

        <button v-if="state === 'listening_for_wake'" className="btn-secondary" @click="triggerManualQuery()">
          直接说话提问
        </button>
      </div>

      <!-- Text Input Search Bar -->
      <form className="search-bar-form" @submit.prevent="handleTextSearchSubmit">
        <input
          type="text"
          className="search-input"
          :placeholder="apiKey ? '输入您的游戏问题并按回车...' : '请先在右上角配置 Gemini API'"
          v-model="textQuery"
          :disabled="!apiKey || state === 'thinking'"
        />
        <button
          type="submit"
          className="search-submit-btn"
          :disabled="!apiKey || !textQuery.trim() || state === 'thinking'"
        >
          🔍 搜索攻略
        </button>
      </form>

      <div v-if="error" className="error-message">⚠️ {{ error }}</div>

      <!-- Live Conversation Cards -->
      <div className="content-cards">
        <div v-if="transcript" className="card user-card">
          <div className="card-header">玩家提问：</div>
          <div className="card-body">“{{ transcript }}”</div>
        </div>

        <div v-if="aiResponse" className="card assistant-card">
          <div className="card-header">智能攻略回复：</div>
          <div className="card-body markdown-content">{{ aiResponse }}</div>
        </div>
      </div>

      <!-- Helper Panel -->
      <div className="helper-panel">
        <h3>您可以直接点击以下问题获取攻略（支持键盘输入及语音唤醒）：</h3>
        <div className="sample-list">
          <button
            v-for="(q, idx) in SAMPLE_QUESTIONS"
            :key="idx"
            className="sample-item"
            :disabled="!apiKey || state === 'thinking'"
            @click="queryGemini(q)"
          >
            “{{ q }}”
          </button>
        </div>
      </div>
    </main>

    <footer className="footer">
      <p>© 2026 GameAssistant. Built on Cloudflare Edge with Gemini.</p>
    </footer>
  </div>
</template>
