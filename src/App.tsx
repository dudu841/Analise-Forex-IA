import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { Send, Image as ImageIcon, X, Loader2, Bot, User, TrendingUp, Crosshair, Trash2, ScanLine, Upload } from 'lucide-react';
import Markdown from 'react-markdown';
import localforage from 'localforage';

declare global {
  interface Window {
    TradingView: any;
  }
}

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  image?: string; // base64 data URL
}

const TradingViewWidget = ({ symbol }: { symbol: string }) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';
    
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => {
      if (window.TradingView) {
        new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: "15",
          timezone: "America/Sao_Paulo",
          theme: "dark",
          style: "1",
          locale: "br",
          enable_publishing: false,
          allow_symbol_change: true,
          backgroundColor: "#0f172a", // slate-900
          gridColor: "#1e293b", // slate-800
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: "tv_chart_container",
        });
      }
    };
    container.current.appendChild(script);
  }, [symbol]);

  return <div id="tv_chart_container" ref={container} className="w-full h-full" />;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localforage.getItem<Message[]>('trader_ai_history').then((saved) => {
      if (saved && saved.length > 0) {
        setMessages(saved);
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          text: 'Olá! Sou sua IA de Trading Avançada. Envie a foto ou print do seu gráfico. Farei uma leitura instantânea de Price Action, Suportes/Resistências, Bandas e outras confluências para te dar um sinal objetivo com Entrada, Alvo e Stop.'
        }]);
      }
      setIsLoaded(true);
    }).catch((err) => {
      console.error('Failed to load chat history', err);
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        text: 'Olá! Sou sua IA de Trading Avançada. Envie a foto ou print do seu gráfico. Farei uma leitura instantânea de Price Action, Suportes/Resistências, Bandas e outras confluências para te dar um sinal objetivo com Entrada, Alvo e Stop.'
      }]);
      setIsLoaded(true);
    });
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (isLoaded) {
      localforage.setItem('trader_ai_history', messages).catch(console.error);
    }
  }, [messages, isLoaded]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 800; // Reduced to 800px for much faster processing
        let { width, height } = img;

        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality for speed
        const compressedImage = canvas.toDataURL('image/jpeg', 0.7);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Auto send
        handleSend(compressedImage, "Analise este gráfico e me dê o sinal de operação.");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleScreenCapture = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("A captura de tela não é suportada neste navegador ou dispositivo (ex: celulares). Use o botão de anexar.");
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
        preferCurrentTab: true
      } as any);

      const video = document.createElement('video');
      video.srcObject = stream;
      
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve);
        };
      });

      // Small delay to ensure video is rendering
      await new Promise(r => setTimeout(r, 100));

      const tvElement = document.getElementById('tv_chart_container');
      if (!tvElement) throw new Error("Chart container not found");
      const rect = tvElement.getBoundingClientRect();

      const scaleX = video.videoWidth / window.innerWidth;
      const scaleY = video.videoHeight / window.innerHeight;

      const cropX = rect.x * scaleX;
      const cropY = rect.y * scaleY;
      const cropWidth = rect.width * scaleX;
      const cropHeight = rect.height * scaleY;

      // Scale down for faster AI processing
      const MAX_SIZE = 800;
      let finalWidth = cropWidth;
      let finalHeight = cropHeight;
      if (finalWidth > finalHeight && finalWidth > MAX_SIZE) {
        finalHeight *= MAX_SIZE / finalWidth;
        finalWidth = MAX_SIZE;
      } else if (finalHeight > MAX_SIZE) {
        finalWidth *= MAX_SIZE / finalHeight;
        finalHeight = MAX_SIZE;
      }

      const canvas = document.createElement('canvas');
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, finalWidth, finalHeight);
      
      const imageUrl = canvas.toDataURL('image/jpeg', 0.7);

      // Stop all tracks to end the screen sharing session immediately
      stream.getTracks().forEach(track => track.stop());

      // Auto send
      await handleSend(imageUrl, "Analise este gráfico e me dê o sinal de operação.");

    } catch (err) {
      console.error("Error capturing screen:", err);
      // User likely cancelled the screen share prompt, no action needed
    }
  };

  const handleSend = async (autoImage?: string, autoText?: string) => {
    const textToSend = autoText !== undefined ? autoText : input;
    const imageToSend = autoImage !== undefined ? autoImage : selectedImage;

    if (!textToSend.trim() && !imageToSend) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      image: imageToSend || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    if (autoText === undefined) setInput('');
    if (autoImage === undefined) setSelectedImage(null);
    setIsTyping(true);

    try {
      const parts: any[] = [];
      
      if (userMessage.image) {
        // Extract base64 data and mime type
        const match = userMessage.image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          });
        }
      }
      
      if (userMessage.text) {
        parts.push({ text: userMessage.text });
      } else if (userMessage.image) {
        parts.push({ text: "Analise este gráfico e me dê o sinal de operação." });
      }

      const systemInstruction = `
Você é uma IA de Trading Institucional focada em VELOCIDADE E OBJETIVIDADE.
Sua análise deve ser profunda (SMC, Macro, Multi-timeframe), porém a resposta deve ser DIRETA AO PONTO. Sem enrolação.

REGRAS DE OURO (FILTROS DE ALTA ASSERTIVIDADE):
1. TENDÊNCIA: Opere APENAS a favor da tendência principal. Contra-tendência é ESTRITAMENTE PROIBIDO.
2. LATERALIZAÇÃO: Se o gráfico estiver lateralizado, consolidado ou sem direção clara, o sinal DEVE SER OBRIGATORIAMENTE NEUTRO (Ficar de fora).
3. ARMADILHAS: Evite rompimentos. Aguarde capturas de liquidez (Sweep) e rejeição a favor da tendência.
4. ORDER BLOCKS & FVG: Identifique rapidamente as zonas institucionais.

Sua resposta DEVE seguir ESTRITAMENTE este formato curto e rápido:

**SINAL DE OPERAÇÃO**
📊 **Probabilidade:** [50%, 80% ou 95%]
⚖️ **Risco/Retorno:** [1:2.5+]
🟢/🔴 **Direção:** [COMPRA, VENDA ou NEUTRO (Mercado Lateral/Indeciso)]
🎯 **Entrada:** [Preço]
🛑 **Stop Loss:** [Preço (Técnico e Curto)]
💰 **Alvo:** [Preço (Longo)]

**MAPEAMENTO RÁPIDO:**
- 🟦 **Zonas:** [Onde estão os OBs/FVGs - 1 linha]
- ➖ **Níveis:** [Suportes/Resistências - 1 linha]
- ⚠️ **Contexto:** [Tendência atual e armadilhas - 1 linha]

**CONFLUÊNCIAS (Máx 3 linhas):**
- [Motivo 1 - Price Action/SMC]
- [Motivo 2 - Tendência/Multi-timeframe]
- [Motivo 3 - Macro/Fundamentos (se aplicável)]
`;

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview', // Using flash model for significantly faster response
        contents: { parts },
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2, // Baixa temperatura para respostas mais diretas e analíticas
        }
      });

      const assistantMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        text: '',
      }]);

      for await (const chunk of responseStream) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, text: msg.text + c.text }
              : msg
          ));
        }
      }
    } catch (error) {
      console.error('Error calling Gemini:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 overflow-hidden">
      {/* Left: TradingView */}
      <div className="h-[45dvh] lg:h-full lg:flex-1 border-b lg:border-b-0 lg:border-r border-slate-800 relative z-0 flex flex-col">
        <TradingViewWidget symbol="BINANCE:BTCUSDT" />
      </div>

      {/* Right: Chat */}
      <div className="flex flex-col h-[55dvh] lg:h-full lg:w-[450px] xl:w-[500px] relative z-10 bg-slate-950">
        {/* Header */}
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md shrink-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 p-1.5 sm:p-2 rounded-lg border border-indigo-500/20">
              <Crosshair className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white leading-tight">Trader AI Pro</h1>
              <p className="text-[10px] sm:text-xs text-slate-400 leading-tight">Análise de Gráficos por Imagem</p>
            </div>
          </div>
          <button 
            onClick={() => {
              if (window.confirm('Deseja apagar todo o histórico de conversas?')) {
                const initialMsg: Message = {
                  id: 'welcome',
                  role: 'assistant',
                  text: 'Olá! Sou sua IA de Trading Avançada. Envie a foto ou print do seu gráfico. Farei uma leitura instantânea de Price Action, Suportes/Resistências, Bandas e outras confluências para te dar um sinal objetivo com Entrada, Alvo e Stop.'
                };
                setMessages([initialMsg]);
                localforage.setItem('trader_ai_history', [initialMsg]).catch(console.error);
              }
            }}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Limpar Histórico"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar relative">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 pb-2">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex gap-2 sm:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                msg.role === 'user' ? 'bg-indigo-600' : 'bg-slate-800 border border-slate-700'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />}
              </div>
              
              <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm'
              }`}>
                {msg.image && (
                  <img 
                    src={msg.image} 
                    alt="Uploaded chart" 
                    className="max-w-full rounded-lg mb-2 sm:mb-3 border border-slate-700/50 object-contain max-h-[300px] sm:max-h-[400px]"
                    referrerPolicy="no-referrer"
                  />
                )}
                {msg.text && (
                  <div className={`prose prose-sm sm:prose-base max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-invert prose-p:leading-relaxed prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-strong:text-indigo-300 prose-ul:my-1 prose-li:my-0'}`}>
                    <Markdown>{msg.text}</Markdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex gap-2 sm:gap-4 flex-row">
              <div className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-3 sm:p-4 flex items-center gap-2 sm:gap-3 shadow-sm">
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400 animate-spin" />
                <span className="text-xs sm:text-sm text-slate-400">Analisando confluências e Price Action...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="border-t border-slate-800 bg-slate-900/95 backdrop-blur-md p-3 sm:p-4 shrink-0 pb-safe z-10">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          
          {/* Desktop Capture Button */}
          <button 
            onClick={handleScreenCapture}
            className="hidden sm:flex w-full items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-4 rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
          >
            <ScanLine className="w-5 h-5" />
            <span>Capturar e Analisar Gráfico Automaticamente</span>
          </button>

          {/* Mobile Upload Button */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="sm:hidden w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-4 rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
          >
            <Upload className="w-5 h-5" />
            <span>Enviar Print da Galeria</span>
          </button>

          <div className="flex items-end gap-1.5 sm:gap-2 bg-slate-950 border border-slate-800 rounded-2xl p-1.5 sm:p-2 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all shadow-inner">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="hidden sm:flex shrink-0 p-2.5 sm:p-3 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded-xl transition-colors"
              title="Anexar arquivo manualmente"
            >
              <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ou digite uma pergunta..."
              className="flex-1 max-h-28 sm:max-h-32 min-h-[40px] sm:min-h-[44px] bg-transparent border-none resize-none focus:ring-0 text-slate-200 placeholder:text-slate-500 py-2.5 sm:py-3 px-2 sm:px-3 text-sm sm:text-base custom-scrollbar"
              rows={1}
            />
            
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="shrink-0 p-2.5 sm:p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 hover:text-white disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </footer>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom, 16px);
        }
      `}</style>
    </div>
  );
}
