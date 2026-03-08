import { useState, useEffect } from 'react'
import { User, CreditCard, Users, Plug, Upload, Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useUsageStore } from '../stores/usageStore'
import { useApiStatusStore } from '../stores/apiStatusStore'

const tabs = [
  { id: 'profile', label: 'פרופיל', icon: User },
  { id: 'subscription', label: 'מנוי', icon: CreditCard },
  { id: 'team', label: 'צוות', icon: Users },
  { id: 'integrations', label: 'אינטגרציות', icon: Plug },
]

const teamMembers = [
  { name: 'מתן כהן', email: 'matan@example.com', role: 'Admin', avatar: 'מכ' },
  { name: 'שירה לוי', email: 'shira@example.com', role: 'Editor', avatar: 'של' },
  { name: 'דניאל אברהם', email: 'daniel@example.com', role: 'Viewer', avatar: 'דא' },
]

const billingHistory = [
  { date: '01/03/2026', amount: '$24.00', status: 'שולם' },
  { date: '01/02/2026', amount: '$24.00', status: 'שולם' },
  { date: '01/01/2026', amount: '$24.00', status: 'שולם' },
]

const roleBadgeColors: Record<string, string> = {
  Admin: 'bg-purple-500/20 text-purple-300',
  Editor: 'bg-blue-500/20 text-blue-300',
  Viewer: 'bg-gray-500/20 text-gray-300',
}

interface ApiStatus {
  openai: { connected: boolean; model: string }
  elevenlabs: { connected: boolean }
  deepl: { connected: boolean }
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile')
  const { addToast } = useUIStore()
  const usage = useUsageStore()
  const apiStatusStore = useApiStatusStore()
  const checkingStatus = apiStatusStore.loading

  const apiStatus: ApiStatus | null = apiStatusStore.checked ? {
    openai: { connected: apiStatusStore.openai.connected, model: 'gpt-4o' },
    elevenlabs: { connected: apiStatusStore.elevenlabs.connected },
    deepl: { connected: apiStatusStore.deepl.connected },
  } : null

  const checkApiStatus = async () => {
    await apiStatusStore.checkStatus()
    addToast('סטטוס API עודכן', 'success')
  }

  useEffect(() => {
    if (activeTab === 'integrations') {
      apiStatusStore.checkStatus()
    }
  }, [activeTab])

  const apiCards = [
    {
      name: 'OpenAI',
      icon: '🤖',
      key: 'openai' as const,
      features: ['תמלול (Whisper)', 'עוזר AI (GPT-4o)', 'יצירת תמונות (DALL-E 3)'],
      description: 'תמלול אוטומטי, עוזר AI חכם ויצירת תמונות',
    },
    {
      name: 'ElevenLabs',
      icon: '🎙️',
      key: 'elevenlabs' as const,
      features: ['שכפול קול', 'המרת טקסט לדיבור', 'דאבינג'],
      description: 'שכפול קולות ויצירת דיבור מטקסט',
    },
    {
      name: 'DeepL',
      icon: '🌍',
      key: 'deepl' as const,
      features: ['תרגום כתוביות', 'תרגום תוכן', 'תרגום אצווה'],
      description: 'תרגום אוטומטי באיכות גבוהה',
    },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <div className="flex gap-1 border-b border-white/[0.06]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent-purple text-white'
                  : 'border-transparent text-text-muted hover:text-white'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="bg-bg-card rounded-xl p-6 border border-white/[0.06]">
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-2xl font-bold">מ</div>
              <button className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-sm">
                <Upload size={16} />
                העלה תמונה
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">שם מלא</label>
                <input defaultValue="מתן כהן" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none focus:border-accent-purple/30" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">אימייל</label>
                <input defaultValue="matan@example.com" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none focus:border-accent-purple/30" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">סיסמה</label>
                <input type="password" defaultValue="••••••••" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none focus:border-accent-purple/30" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">שפה מועדפת</label>
                <select className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none cursor-pointer">
                  <option>עברית</option>
                  <option>English</option>
                </select>
              </div>
            </div>
            <button onClick={() => addToast('השינויים נשמרו!', 'success')} className="px-6 py-2.5 bg-accent-purple hover:bg-accent-purple/80 rounded-xl text-sm font-medium transition-colors">שמור שינויים</button>
          </div>
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-accent-blue to-bg-panel rounded-xl p-6 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">Creator</h3>
                  <p className="text-text-secondary text-sm">$24/חודש</p>
                </div>
                <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs">פעיל</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1"><span>שעות מדיה</span><span>14/20</span></div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: '70%' }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1"><span>AI Credits</span><span>280/400</span></div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full" style={{ width: '70%' }} /></div>
                </div>
              </div>
            </div>

            {/* API Usage Section */}
            <div className="bg-white/5 rounded-xl p-5 border border-white/[0.06]">
              <h3 className="font-medium mb-3">שימוש ב-API החודש</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Whisper (תמלול)</span>
                  <span>{usage.whisperMinutes.toFixed(1)} דקות</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">GPT-4o (AI)</span>
                  <span>{usage.gptTokens.toLocaleString()} tokens</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">ElevenLabs (קול)</span>
                  <span>{usage.elevenLabsCharacters.toLocaleString()} תווים</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">DeepL (תרגום)</span>
                  <span>{usage.deeplCharacters.toLocaleString()} תווים</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">DALL-E (תמונות)</span>
                  <span>{usage.dalleImages} תמונות</span>
                </div>
                <div className="pt-2 border-t border-white/[0.06] flex justify-between items-center font-medium">
                  <span>עלות משוערת</span>
                  <span className="text-accent-purple">${usage.estimatedCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <button onClick={() => addToast('מעביר לדף שדרוג...', 'info')} className="px-6 py-2.5 bg-accent-blue/20 hover:bg-accent-blue/30 rounded-xl text-sm font-medium transition-colors">שדרג מנוי</button>
            <div>
              <h3 className="font-medium mb-3">היסטוריית חיובים</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-text-muted border-b border-white/[0.06]"><th className="text-right p-2">תאריך</th><th className="text-right p-2">סכום</th><th className="text-right p-2">סטטוס</th></tr></thead>
                <tbody>
                  {billingHistory.map((item, i) => (
                    <tr key={i} className="border-b border-white/[0.06]"><td className="p-2">{item.date}</td><td className="p-2">{item.amount}</td><td className="p-2 text-green-400">{item.status}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="space-y-6">
            <div className="space-y-3">
              {teamMembers.map((member, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-xs font-bold">{member.avatar}</div>
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-text-muted">{member.email}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${roleBadgeColors[member.role]}`}>{member.role}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="אימייל להזמנה" className="flex-1 px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none focus:border-accent-purple/30" />
              <select className="px-3 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none cursor-pointer">
                <option>Editor</option>
                <option>Viewer</option>
              </select>
              <button onClick={() => addToast('ההזמנה נשלחה!', 'success')} className="px-4 py-2.5 bg-accent-purple hover:bg-accent-purple/80 rounded-xl text-sm transition-colors">הזמן</button>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">שירותי API</h3>
              <button
                onClick={checkApiStatus}
                disabled={checkingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={checkingStatus ? 'animate-spin' : ''} />
                בדוק חיבור
              </button>
            </div>

            {!apiStatus && checkingStatus && (
              <div className="text-center py-8">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-accent-purple" />
                <p className="text-sm text-text-muted">בודק חיבור לשרת...</p>
              </div>
            )}

            {apiStatus && apiCards.map((card) => {
              const connected = apiStatus[card.key]?.connected
              return (
                <div key={card.key} className="p-4 bg-white/5 rounded-xl border border-white/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{card.icon}</span>
                      <div>
                        <p className="font-medium text-sm">{card.name}</p>
                        <p className="text-xs text-text-muted">{card.description}</p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${
                      connected ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-text-muted'
                    }`}>
                      {connected ? <><Check size={14} /> מחובר</> : <><AlertCircle size={14} /> לא מחובר</>}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {card.features.map((feature) => (
                      <span key={feature} className={`px-2 py-0.5 rounded-full text-xs ${
                        connected ? 'bg-accent-purple/10 text-accent-purple' : 'bg-white/5 text-text-muted'
                      }`}>
                        {feature}
                      </span>
                    ))}
                  </div>
                  {!connected && (
                    <p className="text-xs text-text-muted mt-3">
                      הוסף מפתח API בקובץ <code className="bg-white/10 px-1 rounded">.env</code> בתיקיית הפרויקט
                    </p>
                  )}
                </div>
              )
            })}

            {!apiStatus && !checkingStatus && (
              <div className="text-center py-8">
                <AlertCircle size={24} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm text-text-muted">לא ניתן להתחבר לשרת.</p>
                <p className="text-xs text-text-muted mt-1">וודא שהשרת רץ: <code className="bg-white/10 px-1 rounded">npm run server</code></p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
