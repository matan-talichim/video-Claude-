import { create } from 'zustand'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const initialMessages: AIMessage[] = [
  { id: '1', role: 'user', content: 'נקה את האודיו ושפר את האיכות' },
  { id: '2', role: 'assistant', content: 'בוצע! שיפרתי את איכות האודיו:\n✅ הוסרו רעשי רקע\n✅ שופר בהירות הקול\n✅ אוזנו רמות השמע' },
  { id: '3', role: 'user', content: 'הסר את כל מילות המילוי' },
  { id: '4', role: 'assistant', content: 'מצאתי 23 מילות מילוי. הוסרו:\n• אממ (8)\n• כאילו (6)\n• בעצם (5)\n• נו (4)\nנחסכו 1:12 דקות' },
]

interface AIState {
  messages: AIMessage[]
  mode: 'execute' | 'discuss'
  inputValue: string
  setMode: (mode: 'execute' | 'discuss') => void
  setInputValue: (value: string) => void
  addMessage: (role: AIMessage['role'], content: string) => void
}

export const useAIStore = create<AIState>((set) => ({
  messages: initialMessages,
  mode: 'execute',
  inputValue: '',
  setMode: (mode) => set({ mode }),
  setInputValue: (value) => set({ inputValue: value }),
  addMessage: (role, content) =>
    set((s) => ({
      messages: [...s.messages, { id: Date.now().toString(), role, content }],
      inputValue: '',
    })),
}))
