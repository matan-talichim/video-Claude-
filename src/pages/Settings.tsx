import { useState } from 'react'
import { User, CreditCard, Users, Plug, Upload, Check } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'

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

const integrations = [
  { name: 'YouTube', connected: true, icon: '▶️' },
  { name: 'Zoom', connected: false, icon: '📹' },
  { name: 'Slack', connected: false, icon: '💬' },
  { name: 'Google Drive', connected: false, icon: '📁' },
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

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile')
  const { addToast } = useUIStore()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <div className="flex gap-1 border-b border-white/10">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#E94560] text-white'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="bg-[#16213E] rounded-xl p-6 border border-white/5">
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#E94560] to-[#0F3460] flex items-center justify-center text-2xl font-bold">מ</div>
              <button className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-sm">
                <Upload size={16} />
                העלה תמונה
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">שם מלא</label>
                <input defaultValue="מתן כהן" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460]" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">אימייל</label>
                <input defaultValue="matan@example.com" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460]" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">סיסמה</label>
                <input type="password" defaultValue="••••••••" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460]" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">שפה מועדפת</label>
                <select className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer">
                  <option>עברית</option>
                  <option>English</option>
                </select>
              </div>
            </div>
            <button onClick={() => addToast('השינויים נשמרו!', 'success')} className="px-6 py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm font-medium transition-colors">שמור שינויים</button>
          </div>
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-[#0F3460] to-[#16213E] rounded-xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">Creator</h3>
                  <p className="text-white/60 text-sm">$24/חודש</p>
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
            <button onClick={() => addToast('מעביר לדף שדרוג...', 'info')} className="px-6 py-2.5 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-xl text-sm font-medium transition-colors">שדרג מנוי</button>
            <div>
              <h3 className="font-medium mb-3">היסטוריית חיובים</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-white/40 border-b border-white/10"><th className="text-right p-2">תאריך</th><th className="text-right p-2">סכום</th><th className="text-right p-2">סטטוס</th></tr></thead>
                <tbody>
                  {billingHistory.map((item, i) => (
                    <tr key={i} className="border-b border-white/5"><td className="p-2">{item.date}</td><td className="p-2">{item.amount}</td><td className="p-2 text-green-400">{item.status}</td></tr>
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
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E94560] to-[#0F3460] flex items-center justify-center text-xs font-bold">{member.avatar}</div>
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-white/40">{member.email}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${roleBadgeColors[member.role]}`}>{member.role}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="אימייל להזמנה" className="flex-1 px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460]" />
              <select className="px-3 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer">
                <option>Editor</option>
                <option>Viewer</option>
              </select>
              <button onClick={() => addToast('ההזמנה נשלחה!', 'success')} className="px-4 py-2.5 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl text-sm transition-colors">הזמן</button>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((int, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{int.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{int.name}</p>
                    <p className="text-xs text-white/40">{int.connected ? 'מחובר' : 'לא מחובר'}</p>
                  </div>
                </div>
                <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  int.connected ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}>
                  {int.connected ? <><Check size={14} /> מחובר</> : <><Plug size={14} /> חבר</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
