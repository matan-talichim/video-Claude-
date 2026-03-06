import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import ToastContainer from './Toast'
import CommandPalette from './CommandPalette'
import KeyboardShortcuts from './KeyboardShortcuts'
import { useUIStore } from '../stores/uiStore'

export default function Layout() {
  const { toggleCommandPalette, toggleShortcutsModal } = useUIStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }
      // ? key → keyboard shortcuts (only when not typing)
      if (e.key === '?' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        toggleShortcutsModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleCommandPalette, toggleShortcutsModal])

  return (
    <div className="h-screen flex flex-col bg-bg-deepest text-text-primary overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastContainer />
      <CommandPalette />
      <KeyboardShortcuts />
    </div>
  )
}
