import { ref, onUnmounted } from 'vue';
import { GoogleGenAI } from '@google/genai';

// Declare types for Web Speech API in TypeScript
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type AgentState = 'disabled' | 'idle' | 'listening_for_wake' | 'listening_for_query' | 'thinking' | 'speaking';

export function useVoiceAgent(geminiApiKeyRef: { value: string }, systemPrompt: string) {
  const state = ref<AgentState>('idle');
  const wakeWord = ref('小飞');
  const transcript = ref('');
  const aiResponse = ref('');
  const error = ref<string | null>(null);

  const recognition = ref<SpeechRecognition | null>(null);
  const wakeWordRecognition = ref<SpeechRecognition | null>(null);
  const isSpeaking = ref(false);

  // Web Audio API beep sound generator
  const playBeep = (frequency = 600, duration = 0.15) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.error('Audio play failed', e);
    }
  };

  // Text to Speech
  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    isSpeaking.value = true;
    state.value = 'speaking';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    
    utterance.onend = () => {
      isSpeaking.value = false;
      state.value = 'listening_for_wake';
      startWakeWordListening();
    };

    utterance.onerror = (e) => {
      console.error('TTS error', e);
      isSpeaking.value = false;
      state.value = 'listening_for_wake';
      startWakeWordListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Call Gemini API
  const queryGemini = async (queryText: string) => {
    if (!geminiApiKeyRef.value) {
      error.value = '请先配置 Gemini API Key';
      return;
    }

    state.value = 'thinking';
    error.value = null;
    transcript.value = queryText; // Show the user's query

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKeyRef.value });
      
      const prompt = `
        系统设定：${systemPrompt}
        
        用户查询："${queryText}"
        
        请为玩家生成一份简洁、好读的攻略回答。回答必须保持精炼（200字以内），方便语音朗读。
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const responseText = response.text || '未获取到回复内容';
      aiResponse.value = responseText;
      speakText(responseText);
    } catch (err: any) {
      console.error('Gemini query error:', err);
      const errMsg = err.message || '大模型调用失败，请检查 API Key';
      error.value = errMsg;
      speakText('抱歉，获取攻略失败。');
    }
  };

  // Start listening for the actual question
  const startQueryListening = () => {
    if (wakeWordRecognition.value) {
      try {
        wakeWordRecognition.value.stop();
      } catch (e) {}
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      error.value = '当前浏览器不支持语音识别';
      return;
    }

    playBeep(880, 0.1);
    state.value = 'listening_for_query';
    transcript.value = '';

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'zh-CN';

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const query = e.results[0][0].transcript;
      transcript.value = query;
      if (query.trim()) {
        queryGemini(query);
      } else {
        state.value = 'listening_for_wake';
        startWakeWordListening();
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', e);
      if (e.error !== 'no-speech') {
        error.value = `识别失败: ${e.error}`;
      }
      state.value = 'listening_for_wake';
      startWakeWordListening();
    };

    rec.onend = () => {
      if (state.value === 'listening_for_query') {
        setTimeout(startWakeWordListening, 500);
        state.value = 'listening_for_wake';
      }
    };

    recognition.value = rec;
    rec.start();
  };

  // Start listening for wake word
  const startWakeWordListening = () => {
    if (state.value === 'disabled' || isSpeaking.value) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      error.value = '当前浏览器不支持语音识别';
      state.value = 'disabled';
      return;
    }

    if (wakeWordRecognition.value) {
      try {
        wakeWordRecognition.value.stop();
      } catch(e) {}
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'zh-CN';

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript;
          if (text.includes(wakeWord.value) || text.toLowerCase().includes('wake') || text.includes('唤醒')) {
            rec.stop();
            startQueryListening();
            break;
          }
        }
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error('Wake word recognition error:', e);
      if (e.error === 'network') {
        error.value = '语音引擎网络连接失败，请重试';
      }
    };

    rec.onend = () => {
      if (state.value === 'listening_for_wake') {
        setTimeout(() => {
          try {
            if (state.value !== 'disabled' && !isSpeaking.value) {
              rec.start();
            }
          } catch(e) {}
        }, 1000);
      }
    };

    wakeWordRecognition.value = rec;
    state.value = 'listening_for_wake';
    try {
      rec.start();
    } catch(e) {
      console.error(e);
    }
  };

  const stopAgent = () => {
    if (wakeWordRecognition.value) {
      try { wakeWordRecognition.value.stop(); } catch(e) {}
    }
    if (recognition.value) {
      try { recognition.value.stop(); } catch(e) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    state.value = 'idle';
  };

  onUnmounted(() => {
    stopAgent();
  });

  return {
    state,
    wakeWord,
    transcript,
    aiResponse,
    error,
    startAgent: startWakeWordListening,
    stopAgent,
    triggerManualQuery: startQueryListening,
    queryGemini,
  };
}
