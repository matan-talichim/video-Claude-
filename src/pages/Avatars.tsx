import { useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import Modal from '../components/Modal'

const avatars = [
  { name: 'ליאור', langs: 'עב, EN', style: 'מקצועי', gradient: 'from-blue-400 to-blue-600' },
  { name: 'מאיה', langs: 'עב, EN', style: 'חם', gradient: 'from-pink-400 to-pink-600' },
  { name: 'דביר', langs: 'עב, EN', style: 'אנרגטי', gradient: 'from-green-400 to-green-600' },
  { name: 'נועם', langs: 'עב', style: 'רגוע', gradient: 'from-purple-400 to-purple-600' },
  { name: 'שני', langs: 'עב, EN, AR', style: 'מקצועי', gradient: 'from-orange-400 to-orange-600' },
  { name: 'אלון', langs: 'עב, EN', style: 'דינמי', gradient: 'from-cyan-400 to-cyan-600' },
  { name: 'תמר', langs: 'עב', style: 'ידידותי', gradient: 'from-red-400 to-red-600' },
  { name: 'יונתן', langs: 'עב, EN, RU', style: 'מקצועי', gradient: 'from-indigo-400 to-indigo-600' },
]

const styles = ['מינימליסטי', 'תאגידי', 'יצירתי', 'דינמי', 'אלגנטי', 'רטרו']

export default function Avatars() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(0)
  const [selectedStyle, setSelectedStyle] = useState('מינימליסטי')

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">אווטארים AI</h1>
        <p className="text-white/50 text-sm">צור סרטונים עם דוברים וירטואליים מציאותיים</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {avatars.map((avatar, i) => (
          <div key={i} className="bg-[#16213E] rounded-xl p-4 border border-white/5 hover:border-[#0F3460] transition-all duration-200 hover:shadow-lg group">
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${avatar.gradient} mx-auto mb-3 group-hover:scale-105 transition-transform`} />
            <p className="text-sm font-medium text-center">{avatar.name}</p>
            <div className="flex items-center justify-center gap-2 text-xs text-white/40 my-2">
              <span>{avatar.langs}</span>
              <span className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">{avatar.style}</span>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-colors">צפה בדמו</button>
              <button className="flex-1 py-1.5 bg-[#0F3460] hover:bg-[#0F3460]/80 rounded-lg text-xs transition-colors">בחר</button>
            </div>
          </div>
        ))}

        <button
          onClick={() => setShowCreateModal(true)}
          className="border-2 border-dashed border-white/20 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-[#E94560] transition-colors min-h-[200px]"
        >
          <Plus size={28} className="text-white/30" />
          <span className="text-sm text-white/40 text-center">צור אווטאר מותאם אישית</span>
        </button>
      </div>

      <div className="bg-[#16213E] rounded-xl p-6 border border-white/5 space-y-5">
        <h2 className="text-lg font-bold">יצירת סרטון מאווטאר</h2>

        <div>
          <label className="text-sm text-white/60 block mb-1">סקריפט</label>
          <textarea
            placeholder="כתוב את הטקסט שהאווטאר יגיד..."
            className="w-full px-4 py-3 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460] h-32 resize-none"
          />
        </div>

        <div>
          <label className="text-sm text-white/60 block mb-2">בחר אווטאר</label>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {avatars.map((avatar, i) => (
              <button
                key={i}
                onClick={() => setSelectedAvatar(i)}
                className={`shrink-0 w-14 h-14 rounded-full bg-gradient-to-br ${avatar.gradient} transition-all ${
                  selectedAvatar === i ? 'ring-2 ring-[#E94560] ring-offset-2 ring-offset-[#16213E] scale-110' : 'opacity-60 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-white/60 block mb-1">קול</label>
          <select className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer">
            <option>דנה - מקצועית</option>
            <option>יואב - אנרגטי</option>
            <option>שירה - חמה</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-white/60 block mb-2">סגנון</label>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {styles.map((style) => (
              <button
                key={style}
                onClick={() => setSelectedStyle(style)}
                className={`py-2 rounded-xl text-xs transition-colors ${
                  selectedStyle === style ? 'bg-[#0F3460] text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-white/40">משך משוער: ~0:45</span>
          <button className="px-6 py-3 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl font-medium transition-colors">צור סרטון</button>
        </div>
      </div>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="צור אווטאר מותאם אישית" size="lg">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 bg-white/5 rounded-xl text-center border-2 border-dashed border-white/20 hover:border-[#E94560] cursor-pointer transition-colors">
              <Upload size={32} className="mx-auto mb-2 text-white/30" />
              <p className="text-sm">העלה תמונת פנים</p>
            </div>
            <div className="p-6 bg-white/5 rounded-xl">
              <label className="text-sm text-white/60 block mb-1">תאר את המראה</label>
              <textarea placeholder="גבר בן 30, שיער כהה, חולצה כחולה..." className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm h-20 resize-none focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/60 block mb-1">שם</label>
              <input placeholder="שם האווטאר" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-1">קול</label>
              <select className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer">
                <option>דנה - מקצועית</option>
                <option>יואב - אנרגטי</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-white/60 block mb-1">סגנון דיבור</label>
            <select className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer">
              <option>מקצועי</option>
              <option>ידידותי</option>
              <option>אנרגטי</option>
              <option>רגוע</option>
            </select>
          </div>
          <button onClick={() => setShowCreateModal(false)} className="w-full py-3 bg-[#E94560] hover:bg-[#E94560]/80 rounded-xl font-medium transition-colors">צור אווטאר</button>
        </div>
      </Modal>
    </div>
  )
}
