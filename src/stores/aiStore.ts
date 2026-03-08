import { create } from 'zustand'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isProcessing?: boolean
}

interface AIState {
  messages: AIMessage[]
  mode: 'execute' | 'discuss'
  inputValue: string
  isProcessing: boolean
  setMode: (mode: 'execute' | 'discuss') => void
  setInputValue: (value: string) => void
  addMessage: (role: AIMessage['role'], content: string, isProcessing?: boolean) => string
  updateMessage: (id: string, content: string, isProcessing?: boolean) => void
  removeMessage: (id: string) => void
  setIsProcessing: (processing: boolean) => void
  clearMessages: () => void
}

export const useAIStore = create<AIState>((set) => ({
  messages: [],
  mode: 'execute',
  inputValue: '',
  isProcessing: false,
  setMode: (mode) => set({ mode }),
  setInputValue: (value) => set({ inputValue: value }),
  addMessage: (role, content, isProcessing = false) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 5)
    set((s) => ({
      messages: [...s.messages, { id, role, content, isProcessing }],
      inputValue: role === 'user' ? '' : s.inputValue,
    }))
    return id
  },
  updateMessage: (id, content, isProcessing = false) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content, isProcessing } : m
      ),
    }))
  },
  removeMessage: (id) => {
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }))
  },
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  clearMessages: () => set({ messages: [] }),
}))
