import { useState, useEffect } from 'react';
import { useVoiceAgent, type AgentState } from './hooks/useVoiceAgent';
import './App.css';

const SYSTEM_PROMPT = `你是一个专业的游戏攻略助手。请为玩家解答有关各种游戏的问题，包括角色配队、关卡攻略、装备推荐等。请保持回答简洁易懂，且利于语音播报。`;

const SAMPLE_QUESTIONS = [
  '原神神里绫华怎么配队？',
  '艾尔登法环怎么击败女武神？',
  '王者荣耀当前版本的强势英雄有哪些？',
  '黑神话悟空第一关怎么过？',
];

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');

  const {
    state,
    wakeWord,
    setWakeWord,
    transcript,
    aiResponse,
    error,
    startAgent,
    stopAgent,
    triggerManualQuery,
  } = useVoiceAgent(apiKey, SYSTEM_PROMPT);

  useEffect(() => {
    setTempKey(apiKey);
  }, [apiKey]);

  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', tempKey);
    setApiKey(tempKey);
    setShowSettings(false);
  };

  const getStateText = (state: AgentState) => {
    switch (state) {
      case 'idle':
        return '已关闭语音助手';
      case 'listening_for_wake':
        return `正在监听唤醒词（说“${wakeWord}”唤醒我）`;
      case 'listening_for_query':
        return '正在聆听您的指令...';
      case 'thinking':
        return '正在查阅攻略中...';
      case 'speaking':
        return '正在为您语音播报...';
      case 'disabled':
        return '浏览器不支持或未授权麦克风';
      default:
        return '状态未知';
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo-container">
          <span className="logo-icon">🎮</span>
          <span className="logo-text">GameAssistant</span>
        </div>
        <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>
          ⚙️ 设置 API
        </button>
      </header>

      {showSettings && (
        <div className="modal-overlay">
          <div className="settings-modal">
            <h2>配置大模型 API</h2>
            <p className="modal-desc">此项目完全运行在您的浏览器本地，API 密钥仅保存在您的本地浏览器中，绝不会上传泄露。</p>
            <div className="input-group">
              <label>Gemini API Key</label>
              <input
                type="password"
                placeholder="请输入以 AIzaSy 开头的 Gemini API Key"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
              />
              <span className="key-tip">
                可在 <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a> 免费获取。
              </span>
            </div>
            <div className="input-group">
              <label>自定义唤醒词</label>
              <input
                type="text"
                value={wakeWord}
                onChange={(e) => setWakeWord(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowSettings(false)}>取消</button>
              <button className="btn-save" onClick={saveApiKey}>保存</button>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {/* State visual indicator / Avatar */}
        <div className={`avatar-container state-${state}`}>
          <div className="avatar-pulse-1"></div>
          <div className="avatar-pulse-2"></div>
          <div className="avatar-sphere" onClick={state === 'idle' ? startAgent : stopAgent}>
            {state === 'idle' && '🔇'}
            {state === 'listening_for_wake' && '🎙️'}
            {state === 'listening_for_query' && '👂'}
            {state === 'thinking' && '🧠'}
            {state === 'speaking' && '🔊'}
            {state === 'disabled' && '❌'}
          </div>
        </div>

        <h2 className="agent-status">{getStateText(state)}</h2>

        {/* Start / Stop Toggle */}
        <div className="control-panel">
          {state === 'idle' ? (
            <button className="btn-primary" onClick={startAgent}>
              开启语音唤醒
            </button>
          ) : (
            <button className="btn-danger" onClick={stopAgent}>
              关闭语音助手
            </button>
          )}

          {state === 'listening_for_wake' && (
            <button className="btn-secondary" onClick={triggerManualQuery}>
              直接说话提问
            </button>
          )}
        </div>

        {error && <div className="error-message">⚠️ {error}</div>}

        {/* Live Conversation Cards */}
        <div className="content-cards">
          {transcript && (
            <div className="card user-card">
              <div className="card-header">您说：</div>
              <div className="card-body">“{transcript}”</div>
            </div>
          )}

          {aiResponse && (
            <div className="card assistant-card">
              <div className="card-header">智能攻略回复：</div>
              <div className="card-body markdown-content">{aiResponse}</div>
            </div>
          )}
        </div>

        {/* Helper Panel */}
        <div className="helper-panel">
          <h3>你可以尝试这样问我：</h3>
          <div className="sample-list">
            {SAMPLE_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                className="sample-item"
                disabled={!apiKey || state === 'thinking'}
                onClick={() => {
                  if (state === 'idle') {
                    startAgent();
                  }
                  triggerManualQuery();
                  // Simulate typing
                  setTimeout(() => {
                    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
                    if (SpeechRec) {
                      // We directly call queryGemini for convenience when clicking samples
                      // To do that, we manually query gemini via custom trigger or just tell user to speak.
                      // Here we trigger the speech recognizer, they can just say it.
                    }
                  }, 500);
                }}
              >
                “{q}”
              </button>
            ))}
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>© 2026 GameAssistant. Built on Cloudflare Edge with Gemini.</p>
      </footer>
    </div>
  );
}

export default App;
