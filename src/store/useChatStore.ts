import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  audio?: string;
  image?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

interface ChatState {
  sessions: Record<string, ChatSession>;
  activeSessionId: string | null;
  isStreaming: boolean;
  currentStreamingText: string;
  setActiveSession: (id: string) => void;
  createNewSession: () => string;
  appendMessage: (sessionId: string, message: Message) => void;
  updateStreamingBuffer: (text: string) => void;
  commitStreamingBuffer: (sessionId: string) => void;
  deleteSession: (id: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  isStreaming: false,
  currentStreamingText: '',
  
  setActiveSession: (id) => set({ activeSessionId: id }),
  
  createNewSession: () => {
    const id = Math.random().toString(36).substring(7);
    const newSession: ChatSession = {
      id,
      title: 'New Conversation',
      messages: [],
    };
    set((state) => ({
      sessions: { ...state.sessions, [id]: newSession },
      activeSessionId: id,
    }));
    return id;
  },
  
  appendMessage: (sessionId, message) => set((state) => {
    const session = state.sessions[sessionId];
    if (!session) return state;
    
    // Update title if it's the first user message
    let title = session.title;
    if (session.messages.length === 0 && message.role === 'user') {
      title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
    }

    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...session,
          title,
          messages: [...session.messages, message],
        },
      },
    };
  }),
  
  updateStreamingBuffer: (text) => set({ 
    currentStreamingText: get().currentStreamingText + text, 
    isStreaming: true 
  }),
  
  commitStreamingBuffer: (sessionId) => set((state) => {
    const session = state.sessions[sessionId];
    if (!session || !state.currentStreamingText) return { isStreaming: false, currentStreamingText: '' };
    
    const assistantMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'assistant',
      content: state.currentStreamingText,
      timestamp: Date.now(),
    };
    
    return {
      isStreaming: false,
      currentStreamingText: '',
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...session,
          messages: [...session.messages, assistantMessage],
        },
      },
    };
  }),

  deleteSession: (id) => set((state) => {
    const { [id]: _, ...remainingSessions } = state.sessions;
    let nextActiveId = state.activeSessionId;
    if (nextActiveId === id) {
      const keys = Object.keys(remainingSessions);
      nextActiveId = keys.length > 0 ? keys[keys.length - 1] : null;
    }
    return {
      sessions: remainingSessions,
      activeSessionId: nextActiveId
    };
  })
}));
