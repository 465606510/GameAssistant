import { useState, useEffect, useRef } from 'react';
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

export function useVoiceAgent(geminiApiKey: string, systemPrompt: string) {
  const [state, setState] = useState<AgentState>('idle');
  const stateRef = useRef<AgentState>('idle');

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [wakeWord, setWakeWord] = useState('小飞');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeWordRecognitionRef = useRef<SpeechRecognition | null>(null);
  const isSpeakingRef = useRef(false);

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
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    isSpeakingRef.current = true;
    setState('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    
    utterance.onend = () => {
      isSpeakingRef.current = false;
      setState('listening_for_wake');
      startWakeWordListening();
    };

    utterance.onerror = (e) => {
      console.error('TTS error', e);
      isSpeakingRef.current = false;
      setState('listening_for_wake');
      startWakeWordListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Call Gemini API
  const queryGemini = async (queryText: string) => {
    if (!geminiApiKey) {
      setError('请先配置 Gemini API Key');
      setState('listening_for_wake');
      startWakeWordListening();
      return;
    }

    setState('thinking');
    setError(null);

    try {
      // Correct modern Gemini API integration using @google/genai
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      
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
      setAiResponse(responseText);
      speakText(responseText);
    } catch (err: any) {
      console.error('Gemini query error:', err);
      const errMsg = err.message || '大模型调用失败，请检查 API Key';
      setError(errMsg);
      speakText('抱歉，获取攻略失败。');
    }
  };

  // Start listening for the actual question
  const startQueryListening = () => {
    // Stop wake word listening
    if (wakeWordRecognitionRef.current) {
      try {
        wakeWordRecognitionRef.current.stop();
      } catch (e) {}
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('当前浏览器不支持语音识别');
      return;
    }

    playBeep(880, 0.1); // Higher beep indicating ready to listen query
    setState('listening_for_query');
    setTranscript('');

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'zh-CN';

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const query = e.results[0][0].transcript;
      setTranscript(query);
      if (query.trim()) {
        queryGemini(query);
      } else {
        setState('listening_for_wake');
        startWakeWordListening();
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', e);
      if (e.error !== 'no-speech') {
        setError(`识别失败: ${e.error}`);
      }
      setState('listening_for_wake');
      startWakeWordListening();
    };

    rec.onend = () => {
      // If we are not thinking or speaking, revert to wake listening
      setState((curr) => {
        if (curr === 'listening_for_query') {
          setTimeout(startWakeWordListening, 500);
          return 'listening_for_wake';
        }
        return curr;
      });
    };

    recognitionRef.current = rec;
    rec.start();
  };

  // Start listening for wake word
  const startWakeWordListening = () => {
    if (state === 'disabled' || isSpeakingRef.current) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('当前浏览器不支持语音识别');
      setState('disabled');
      return;
    }

    if (wakeWordRecognitionRef.current) {
      try {
        wakeWordRecognitionRef.current.stop();
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
          if (text.includes(wakeWord) || text.toLowerCase().includes('wake') || text.includes('唤醒')) {
            rec.stop();
            startQueryListening();
            break;
          }
        }
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error('Wake word recognition error:', e);
      // Restart if network or other minor issues
      if (e.error === 'network') {
        setError('语音引擎网络连接失败，请重试');
      }
    };

    rec.onend = () => {
      // Auto restart wake word listening if state is still listening_for_wake
      setState((curr) => {
        if (curr === 'listening_for_wake') {
          setTimeout(() => {
            try {
              if (stateRef.current !== 'disabled' && !isSpeakingRef.current) {
                rec.start();
              }
            } catch(e) {}
          }, 1000);
        }
        return curr;
      });
    };

    wakeWordRecognitionRef.current = rec;
    setState('listening_for_wake');
    try {
      rec.start();
    } catch(e) {
      console.error(e);
    }
  };

  const stopAgent = () => {
    if (wakeWordRecognitionRef.current) {
      try { wakeWordRecognitionRef.current.stop(); } catch(e) {}
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setState('idle');
  };

  useEffect(() => {
    return () => {
      stopAgent();
    };
  }, []);

  return {
    state,
    wakeWord,
    setWakeWord,
    transcript,
    aiResponse,
    error,
    startAgent: startWakeWordListening,
    stopAgent,
    triggerManualQuery: startQueryListening,
  };
}
