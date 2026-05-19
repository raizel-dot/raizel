/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Trash2, 
  PlusCircle, 
  MessageSquare, 
  Menu, 
  X,
  Sparkles,
  Bot,
  User,
  MoreVertical,
  ChevronLeft,
  Mic,
  StopCircle,
  ImagePlus,
  Play,
  Pause,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { useChatStore, Message } from './store/useChatStore';

export default function App() {
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { 
    sessions, 
    activeSessionId, 
    isStreaming, 
    currentStreamingText, 
    setActiveSession, 
    createNewSession, 
    appendMessage, 
    updateStreamingBuffer, 
    commitStreamingBuffer,
    deleteSession
  } = useChatStore();

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const messages = activeSession?.messages || [];

  // Scroll to bottom on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingText]);

  // Create initial session if none exist
  useEffect(() => {
    if (Object.keys(sessions).length === 0) {
      createNewSession();
    }
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioBase64 = await blobToBase64(audioBlob);
        
        if (!activeSessionId) {
          const newId = createNewSession();
          submitMessage(newId, "Voice Message", audioBase64);
        } else {
          submitMessage(activeSessionId, "Voice Message", audioBase64);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      const isIframe = window.self !== window.top;
      let message = "Could not access microphone. Please check your browser settings and ensure permissions are granted.";
      
      if (isIframe) {
        message += "\n\nTip: Try opening the application in a new tab for full hardware access.";
      }
      
      alert(message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const handleGenerateImage = async () => {
    if (!input.trim() || isGeneratingImage) return;

    const prompt = input.trim();
    setInput('');
    setIsGeneratingImage(true);

    const sessionId = activeSessionId || createNewSession();
    
    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: `Generate an image: ${prompt}`,
      timestamp: Date.now(),
    };
    appendMessage(sessionId, userMessage);

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.error || 'Image generation failed';
        if (data.isPaidModelError) {
          errorMessage = "This model requires a paid API key or credits. Please ensure you have enabled billing in your Google AI Studio account.";
        }
        throw new Error(errorMessage);
      }
      
      const assistantMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: `Generated image for: "${prompt}"`,
        image: data.imageUrl,
        timestamp: Date.now(),
      };
      
      appendMessage(sessionId, assistantMessage);
    } catch (err: any) {
      console.error(err);
      appendMessage(sessionId, {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;

    const prompt = input.trim();
    setInput('');

    if (!activeSessionId) {
      const newId = createNewSession();
      submitMessage(newId, prompt);
    } else {
      submitMessage(activeSessionId, prompt);
    }
  };

  const submitMessage = async (sessionId: string, prompt: string, audio?: string) => {
    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: prompt,
      audio,
      timestamp: Date.now(),
    };

    appendMessage(sessionId, userMessage);

    try {
      const session = useChatStore.getState().sessions[sessionId];
      const currentMessages = session ? session.messages : [userMessage];
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: currentMessages }),
      });

      if (!response.ok) throw new Error('Failed to connect to Nova Engine');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      updateStreamingBuffer('');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.text) {
                updateStreamingBuffer(data.text);
              }
            } catch (e) {
              console.error('Error parsing stream chunk', e);
            }
          }
        }
      }

      commitStreamingBuffer(sessionId);
    } catch (error) {
      console.error('Stream error:', error);
      updateStreamingBuffer('Error: Engine interrupted. Please try again.');
      commitStreamingBuffer(sessionId);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-screen bg-brand-bg overflow-hidden text-brand-text">

      {/* Sidebar Mobile Overlay */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/10 z-20 md:hidden"
            onClick={() => setIsSidebarOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ 
          width: isSidebarOpen ? '280px' : '0px',
          x: isSidebarOpen ? 0 : -280 
        }}
        className="bg-brand-sidebar border-r border-brand-border flex flex-col z-30 overflow-hidden shrink-0"
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Sparkles className="text-brand-accent" size={24} />
            <span className="tracking-tight">Nova AI</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 hover:bg-black/5 rounded-md transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        <button
          onClick={() => createNewSession()}
          className="mx-4 mt-2 mb-6 flex items-center gap-2 border border-brand-border bg-white hover:bg-gray-50 transition-colors px-4 py-2.5 rounded-lg text-sm font-medium shadow-sm"
        >
          <PlusCircle size={16} className="text-brand-accent" />
          New Conversation
        </button>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {Object.values(sessions).sort((a, b) => b.id.localeCompare(a.id)).map((session) => (
            <div
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                activeSessionId === session.id 
                  ? 'bg-black/5 text-brand-text' 
                  : 'hover:bg-black/5 text-gray-500 hover:text-brand-text'
              }`}
            >
              <MessageSquare size={18} className={activeSessionId === session.id ? 'text-brand-accent' : ''} />
              <span className="flex-1 truncate text-sm">{session.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-brand-border text-[11px] text-gray-400 flex items-center justify-between font-medium uppercase tracking-wider">
          <span>Engine: Gemini 1.5</span>
          <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 h-full">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 glass-morphism sticky top-0 z-10 border-b border-brand-border shadow-sm">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-black/5 rounded-lg transition-colors"
              >
                <Menu size={20} />
              </button>
            )}
            <div>
              <h1 className="font-semibold text-lg tracking-tight">{activeSession?.title || 'Welcome'}</h1>
              <span className="text-[10px] text-brand-accent uppercase tracking-widest font-bold">Intelligent Core</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-xs font-semibold">User Protocol</span>
              <span className="text-[10px] text-gray-400 lowercase">Authenticated session</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center">
              <User size={18} className="text-brand-accent" />
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8">
          <AnimatePresence initial={false}>
            {messages.length === 0 && !isStreaming && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto"
              >
                <div className="w-20 h-20 bg-brand-accent/10 rounded-full flex items-center justify-center mb-6 ring-8 ring-brand-accent/5">
                  <Sparkles size={40} className="text-brand-accent" />
                </div>
                <h2 className="text-3xl font-bold mb-3 tracking-tight">Nova Intelligence</h2>
                <p className="text-gray-500 mb-10 text-lg leading-relaxed">
                  How can I assist you today? I'm ready to research, code, or discuss complex topics with you.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  {[
                    'Explain the Fermi paradox', 
                    'Write a React component for a data table', 
                    'Suggest a 7-day travel itinerary for Iceland', 
                    'Analyze the impact of remote work on urban planning'
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                      }}
                      className="text-left px-5 py-4 rounded-xl border border-brand-border bg-white hover:bg-brand-sidebar hover:border-brand-accent/30 transition-all text-sm font-medium shadow-sm"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {messages.map((message, i) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-4 max-w-[90%] sm:max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-1 border border-brand-border ${
                    message.role === 'user' ? 'bg-white' : 'bg-brand-accent/5'
                  }`}>
                    {message.role === 'user' ? <User size={16} className="text-gray-600" /> : <Bot size={16} className="text-brand-accent" />}
                  </div>
                  <div className={message.role === 'user' ? 'message-bubble-user mt-1' : 'message-bubble-assistant'}>
                    {message.audio && (
                      <div className="mb-2 bg-black/5 p-2 rounded-lg flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-accent flex items-center justify-center text-white">
                          <Mic size={14} />
                        </div>
                        <audio src={`data:audio/webm;base64,${message.audio}`} controls className="h-8 w-40 sm:w-60" />
                      </div>
                    )}
                    
                    {message.image && (
                      <div className="mb-3 rounded-xl overflow-hidden border border-brand-border">
                        <img 
                          src={message.image} 
                          alt="Generated" 
                          referrerPolicy="no-referrer"
                          className="w-full h-auto max-h-[400px] object-cover" 
                        />
                        <a 
                          href={message.image} 
                          download="nova-ai-image.png"
                          className="flex items-center gap-2 p-2 bg-white text-[10px] font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors border-t border-brand-border"
                        >
                          <Download size={12} />
                          Download Image
                        </a>
                      </div>
                    )}

                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>

                    <div className="mt-2 flex items-center gap-2 opacity-30 font-mono text-[9px] uppercase tracking-tighter">
                      <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {message.role === 'assistant' && <span>• Gemini Optimized</span>}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {isStreaming && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-start"
              >
                <div className="flex gap-4 max-w-[90%] sm:max-w-[80%]">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-brand-accent/5 border border-brand-border flex items-center justify-center mt-1">
                    <Sparkles size={16} className="text-brand-accent animate-pulse" />
                  </div>
                  <div className="message-bubble-assistant">
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{currentStreamingText}</p>
                    <span className="flex gap-1.5 mt-3">
                      <span className="w-1.5 h-1.5 bg-brand-accent/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-brand-accent/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-brand-accent/40 rounded-full animate-bounce" />
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-8 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent">
          <form 
            onSubmit={handleSend}
            className="max-w-3xl mx-auto flex items-end gap-2 bg-white border border-brand-border p-2 rounded-2xl transition-all shadow-xl"
          >
            <div className="flex items-center gap-1 pb-1.5 pl-1.5">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isStreaming || isGeneratingImage}
                  className="p-2.5 rounded-xl text-gray-400 hover:text-brand-accent hover:bg-brand-accent/5 transition-all"
                  title="Record Voice"
                >
                  <Mic size={20} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="p-2.5 rounded-xl text-red-500 bg-red-50 animate-pulse transition-all"
                  title="Stop Recording"
                >
                  <StopCircle size={20} />
                </button>
              )}
              
              <button
                type="button"
                onClick={handleGenerateImage}
                disabled={!input.trim() || isStreaming || isGeneratingImage || isRecording}
                className={`p-2.5 rounded-xl transition-all ${
                  input.trim() && !isStreaming && !isGeneratingImage
                  ? 'text-brand-accent hover:bg-brand-accent/5'
                  : 'text-gray-300'
                }`}
                title="Create Image from Prompt"
              >
                <ImagePlus size={20} className={isGeneratingImage ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="flex-1 relative">
              {isRecording && (
                <div className="absolute inset-0 bg-white flex items-center px-3 z-10">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span>Recording... {formatTime(recordingTime)}</span>
                  </div>
                </div>
              )}
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isRecording}
                placeholder={isRecording ? "" : "What can we solve together?"}
                className="w-full bg-transparent border-none focus:ring-0 outline-none resize-none py-3 px-2 text-[15px] max-h-60 placeholder:text-gray-400"
              />
            </div>
            
            <button
              type="submit"
              disabled={!input.trim() || isStreaming || isRecording || isGeneratingImage}
              className={`p-3 rounded-xl transition-all ${
                input.trim() && !isStreaming && !isRecording && !isGeneratingImage
                  ? 'bg-brand-accent text-white hover:opacity-90 shadow-lg shadow-brand-accent/20' 
                  : 'bg-brand-sidebar text-gray-300 border border-brand-border'
              }`}
            >
              <Send size={18} />
            </button>
          </form>
          <p className="text-[10px] text-center text-gray-400 mt-4 font-medium uppercase tracking-[0.2em] opacity-60">
            Intelligent Interface Layer // Distributed via Gemini
          </p>
        </div>
      </main>
    </div>
  );
}

