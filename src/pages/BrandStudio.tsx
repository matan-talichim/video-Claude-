import { useState } from 'react'
import { Upload, Plus, Copy, Pencil, X } from 'lucide-react'

const templateStyles = [
  { name: 'מינימליסטי', gradient: 'from-gray-600 to-gray-800' },
  { name: 'תאגידי', gradient: 'from-blue-600 to-indigo-800' },
  { name: 'יצירתי', gradient: 'from-pink-500 to-purple-700' },
  { name: 'דינמי', gradient: 'from-orange-500 to-red-700' },
]

export default function BrandStudio() {
  const [brandTerms, setBrandTerms] = useState(['סטודיו AI', 'Descript', 'AI Studio'])
  const [newTerm, setNewTerm] = useState('')
  const [colors, setColors] = useState({ primary: '#E94560', secondary: '#0F3460', accent: '#16213E' })

  const addTerm = () => {
    if (newTerm.trim()) {
      setBrandTerms([...brandTerms, newTerm.trim()])
      setNewTerm('')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">סטודיו מותג</h1>
        <p className="text-text-muted text-sm">נהל את הזהות המותגית שלך במקום אחד</p>
      </div>

      <div className="bg-bg-card rounded-xl p-6 border border-white/[0.06] space-y-6">
        <h2 className="text-lg font-bold">זהות מותגית</h2>
        <div className="flex items-start gap-6">
          <div className="w-32 h-32 bg-white/5 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent-purple transition-colors">
            <Upload size={24} className="text-text-muted" />
            <span className="text-xs text-text-muted">העלה לוגו</span>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex gap-4">
              {Object.entries(colors).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs text-text-muted">{key === 'primary' ? 'ראשי' : key === 'secondary' ? 'משני' : 'הדגשה'}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent"
                    />
                    <input
                      value={value}
                      onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                      className="w-24 px-2 py-1.5 bg-white/5 rounded-lg border border-white/[0.06] text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs text-text-muted">גופן</label>
              <select className="w-full mt-1 px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none cursor-pointer">
                <option>Heebo</option>
                <option>Assistant</option>
                <option>Rubik</option>
                <option>Open Sans Hebrew</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-card rounded-xl p-6 border border-white/[0.06] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">תבניות מותג</h2>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-purple hover:bg-accent-purple/80 rounded-lg text-xs transition-colors">
            <Plus size={14} />
            תבנית חדשה
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {templateStyles.map((tmpl) => (
            <div key={tmpl.name} className="group relative">
              <div className={`h-32 bg-gradient-to-br ${tmpl.gradient} rounded-xl`} />
              <p className="text-sm mt-2 text-center">{tmpl.name}</p>
              <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 bg-black/50 rounded-lg hover:bg-black/70"><Pencil size={12} /></button>
                <button className="p-1.5 bg-black/50 rounded-lg hover:bg-black/70"><Copy size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-bg-card rounded-xl p-6 border border-white/[0.06] space-y-4">
        <h2 className="text-lg font-bold">מונחים מותגיים</h2>
        <p className="text-sm text-text-muted">מונחים שלא יתורגמו באופן אוטומטי</p>
        <div className="flex flex-wrap gap-2">
          {brandTerms.map((term, i) => (
            <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-sm">
              {term}
              <button onClick={() => setBrandTerms(brandTerms.filter((_, j) => j !== i))} className="hover:text-accent-purple">
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
            placeholder="הוסף מונח..."
            className="flex-1 px-4 py-2 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none focus:border-accent-purple/30"
          />
          <button onClick={addTerm} className="px-4 py-2 bg-accent-blue/20 hover:bg-accent-blue/20/80 rounded-xl text-sm transition-colors">הוסף</button>
        </div>
      </div>
    </div>
  )
}
