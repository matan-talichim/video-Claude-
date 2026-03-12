import { useState, useEffect } from 'react'
import { User, CreditCard, Users, Plug, Upload, Check, Loader2, AlertCircle, RefreshCw, Palette, Dna } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useUsageStore } from '../stores/usageStore'
import { useApiStatusStore } from '../stores/apiStatusStore'
import { useUserProfileStore } from '../stores/userProfileStore'
import { usePromptEvolutionStore } from '../stores/promptEvolutionStore'

const tabs = [
  { id: 'profile', label: 'פרופיל', icon: User },
  { id: 'editing-profile', label: 'פרופיל עריכה', icon: Palette },
  { id: 'ai', label: 'AI למידה', icon: Dna },
  { id: 'subscription', label: 'מנוי', icon: CreditCard },
  { id: 'team', label: 'צוות', icon: Users },
  { id: 'integrations', label: 'אינטגרציות', icon: Plug },
]

const MODEL_NAMES: Record<string, string> = {
  'visual_analysis': 'ניתוח ויזואלי',
  'enrichment': 'שיפור פרומפט',
  'creative_brief': 'תכנון קריאטיבי',
  'technical_plan': 'תכנון טכני',
}

function AIEvolutionSettings() {
  const stats = usePromptEvolutionStore(s => s.getStats())
  const evolutions = usePromptEvolutionStore(s => s.evolutions)
  const resetModel = usePromptEvolutionStore(s => s.resetModel)
  const resetAll = usePromptEvolutionStore(s => s.resetAll)

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex justify-between items-center">
        <h3 className="text-white font-medium">למידה עצמית של AI</h3>
        {stats.length > 0 && (
          <button onClick={resetAll} className="text-red-400 text-xs hover:text-red-300">
            אפס הכל
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        כל מודל AI משפר את עצמו אוטומטית. ככל שתשתמש יותר, העריכות יהיו טובות יותר.
      </p>

      {stats.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm">
          עוד לא התחילה למידה. ערוך סרטון ראשון!
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map(stat => (
            <div key={stat.modelId} className="bg-white/5 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-white text-sm">{MODEL_NAMES[stat.modelId] || stat.modelId}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">v{stat.version}</span>
                  <button onClick={() => resetModel(stat.modelId)} className="text-gray-600 hover:text-red-400 text-xs">
                    אפס
                  </button>
                </div>
              </div>

              {/* Evolution progress bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-purple-500 to-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, stat.additions * 7)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{stat.additions}/15</span>
              </div>

              {/* Success rate */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">הצלחה:</span>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      stat.successRate > 0.7 ? 'bg-green-500' :
                      stat.successRate > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${stat.successRate * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400">{Math.round(stat.successRate * 100)}%</span>
              </div>

              {/* Show what was learned */}
              {stat.additions > 0 && (
                <details className="mt-2">
                  <summary className="text-[10px] text-purple-400 cursor-pointer hover:text-purple-300">
                    מה נלמד ({stat.additions} תובנות)
                  </summary>
                  <div className="mt-1 space-y-1 pr-2">
                    {evolutions[stat.modelId]?.additions.map((add, i) => (
                      <div key={i} className="text-[10px] text-gray-400 flex gap-1">
                        <span className="text-purple-500">&#x2022;</span>
                        <span>{add}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Total edits counter */}
      {stats.length > 0 && (
        <div className="text-center bg-purple-500/10 rounded-xl p-3">
          <span className="text-purple-300 text-sm">
            סה"כ {stats.reduce((s, st) => s + st.version, 0)} מחזורי למידה
          </span>
        </div>
      )}
    </div>
  )
}

const PROFILE_PROMPT = `אני עורך וידאו ואני משתמש בתוכנת עריכה עם AI. אני רוצה שתשאל אותי שאלות על סגנון העריכה שלי כדי ליצור פרופיל עריכה מדויק.

בבקשה שאל אותי שאלה אחת בכל פעם וחכה לתשובה שלי לפני שתמשיך לשאלה הבאה.

השאלות:

1. מילות מילוי (אממ, כאילו, נו, בעצם):
   - האם להסיר אותן? הכל? חלק? אילו מילים לשמור?

2. שתיקות בין משפטים:
   - לקצר שתיקות? מעל כמה שניות לחתוך? או לשמור הכל?

3. כתוביות:
   - להוסיף תמיד? לפעמים? בכלל לא?
   - איזה סגנון? (קלאסי / מודרני / קריוקי מילה-מילה / מינימלי / הקלדה / קפיצה)
   - גודל: קטן / בינוני / גדול?
   - מיקום: למעלה / מרכז / למטה?
   - באילו שפות?

4. B-Roll (תמונות וסרטונים שמוכנסים בין קטעי דיבור):
   - להוסיף? הרבה / מעט / בכלל לא?
   - כל כמה שניות בערך?
   - כמה שניות כל קטע B-Roll?

5. מוזיקת רקע:
   - להוסיף? תמיד / לפעמים / אף פעם?
   - עוצמה ביחס לדיבור? (חלש / בינוני / חזק?)
   - סגנון: אנרגטי / רגוע / תאגידי / דרמטי / שמח?
   - להנמיך מוזיקה כשמדברים?

6. קצב עריכה:
   - מהיר (חיתוך כל 3-5 שניות) / בינוני (5-10) / איטי (10+)?
   - למחוק חזרות (כשאומרים אותו דבר פעמיים)?
   - להוסיף זומים? כל כמה משפטים?

7. אפקטים:
   - תיקון קשר עין? כן / לא?
   - מרכוז דובר? כן / לא?
   - החלפת רקע? אם כן, לאיזה?
   - פורמט מועדף: 16:9 / 9:16 / 1:1?

8. סוג תוכן:
   - מה בעיקר אתה עורך? (יוטיוב / TikTok / Reels / פודקאסט / פרסומות / הדרכות?)
   - מי קהל היעד שלך?

9. מה אתה לא אוהב בעריכה אוטומטית?
   - דברים שתמיד משנה אחרי שAI עורך?

10. משהו נוסף?
    - כללים מיוחדים? העדפות ספציפיות?

אחרי שאענה על כל השאלות, תן לי סיכום בפורמט JSON הבא:

\`\`\`json
{
  "fillerWords": { "action": "remove_all", "keepWords": [] },
  "silences": { "action": "moderate", "threshold": 1.0 },
  "captions": { "enabled": true, "style": "modern", "size": 24, "position": "bottom", "languages": ["he"] },
  "broll": { "amount": "some", "frequency": 15, "duration": 4 },
  "music": { "enabled": true, "volume": 20, "mood": "corporate", "ducking": true },
  "pacing": { "cutSpeed": "medium", "removeRetakes": true, "zoomFrequency": 6 },
  "effects": { "eyeContact": false, "centerSpeaker": false, "format": "16:9", "designStyle": "minimalist" },
  "contentType": "youtube",
  "targetAudience": "",
  "dislikes": [],
  "customRules": []
}
\`\`\`

בוא נתחיל! שאל אותי את השאלה הראשונה.`

const teamMembers: { name: string; email: string; role: string; avatar: string }[] = []

const billingHistory: { date: string; amount: string; status: string }[] = []

const roleBadgeColors: Record<string, string> = {
  Admin: 'bg-purple-500/20 text-purple-300',
  Editor: 'bg-blue-500/20 text-blue-300',
  Viewer: 'bg-gray-500/20 text-gray-300',
}

interface ApiStatus {
  openai: { connected: boolean; chatModel: string; transcribeModel: string }
  elevenlabs: { connected: boolean }
  deepl: { connected: boolean }
  gemini: { connected: boolean }
  seedance: { connected: boolean }
  pixabay: { connected: boolean }
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile')
  const { addToast } = useUIStore()
  const usage = useUsageStore()
  const apiStatusStore = useApiStatusStore()
  const checkingStatus = apiStatusStore.loading
  const profile = useUserProfileStore()

  // AI Profile Builder state
  const [copied, setCopied] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [parsing, setParsing] = useState(false)
  const [profileCreated, setProfileCreated] = useState(false)

  const resetProfile = () => {
    profile.resetProfile()
    setProfileCreated(false)
    setAiResponse('')
    addToast('הפרופיל אופס בהצלחה', 'success')
  }

  const parseAndApplyProfile = async () => {
    setParsing(true)
    try {
      let profileData: any = null

      // Method 1: Try to find JSON block in response
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        try { profileData = JSON.parse(jsonMatch[1]) } catch {}
      }

      // Method 2: Try to find raw JSON object
      if (!profileData) {
        const rawJsonMatch = aiResponse.match(/\{[\s\S]*"fillerWords"[\s\S]*\}/)
        if (rawJsonMatch) {
          try { profileData = JSON.parse(rawJsonMatch[0]) } catch {}
        }
      }

      // Method 3: Send to GPT-4o to extract
      if (!profileData) {
        const res = await fetch('http://localhost:3001/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `קרא את הטקסט הבא שמתאר העדפות עריכה של משתמש.
חלץ את ההעדפות והחזר JSON בלבד (בלי שום טקסט נוסף) בפורמט הזה:
{
  "fillerWords": { "action": "remove_all/remove_most/keep", "keepWords": [] },
  "silences": { "action": "aggressive/moderate/keep", "threshold": 1.0 },
  "captions": { "enabled": true, "style": "modern/classic/karaoke/minimal/typewriter/bounce", "size": 24, "position": "bottom/center/top", "languages": ["he"] },
  "broll": { "amount": "lots/some/none", "frequency": 15, "duration": 4 },
  "music": { "enabled": true, "volume": 20, "mood": "energetic/calm/corporate/dramatic", "ducking": true },
  "pacing": { "cutSpeed": "fast/medium/slow", "removeRetakes": true, "zoomFrequency": 6 },
  "effects": { "eyeContact": false, "centerSpeaker": false, "format": "16:9", "designStyle": "minimalist" },
  "contentType": "youtube",
  "targetAudience": "",
  "dislikes": [],
  "customRules": []
}

הטקסט:
${aiResponse}`,
            transcript: '',
            projectName: 'profile-builder',
          }),
        })
        const result = await res.json()
        const responseText = result.message || ''
        const extractedJson = responseText.match(/\{[\s\S]*\}/)
        if (extractedJson) {
          profileData = JSON.parse(extractedJson[0])
        }
      }

      if (!profileData) {
        throw new Error('לא הצלחתי לחלץ פרופיל מהתשובה. ודא שהתשובה כוללת JSON או תיאור מפורט של ההעדפות.')
      }

      // Apply to userProfileStore
      const updates: Record<string, any> = {
        confidenceScore: 0.9,
      }

      if (profileData.fillerWords) {
        updates.fillerWordPreference = profileData.fillerWords.action || 'remove_all'
        updates.fillerWordsKept = profileData.fillerWords.keepWords || []
      }
      if (profileData.silences) {
        updates.silencePreference = profileData.silences.action || 'moderate'
        updates.silenceThreshold = profileData.silences.threshold ?? 1.0
      }
      if (profileData.captions) {
        updates.captionPreference = profileData.captions.enabled !== false ? 'always' : 'never'
        updates.preferredCaptionStyle = profileData.captions.style || 'modern'
        updates.preferredCaptionSize = profileData.captions.size || 24
        updates.preferredCaptionPosition = profileData.captions.position || 'bottom'
        updates.preferredCaptionLanguages = profileData.captions.languages || ['he']
      }
      if (profileData.broll) {
        updates.brollPreference = profileData.broll.amount || 'some'
        updates.brollFrequency = profileData.broll.frequency || 15
        updates.preferredBrollDuration = profileData.broll.duration || 4
      }
      if (profileData.music) {
        updates.musicPreference = profileData.music.enabled !== false ? 'always' : 'never'
        updates.preferredMusicVolume = profileData.music.volume ?? 20
        updates.preferredMusicMood = profileData.music.mood || 'corporate'
        updates.duckingPreference = profileData.music.ducking ?? true
      }
      if (profileData.pacing) {
        updates.preferredCutSpeed = profileData.pacing.cutSpeed || 'medium'
        updates.preferredZoomFrequency = profileData.pacing.zoomFrequency || 6
      }
      if (profileData.effects) {
        updates.eyeContactPreference = !!profileData.effects.eyeContact
        updates.centerSpeakerPreference = !!profileData.effects.centerSpeaker
        updates.preferredFormat = profileData.effects.format || '16:9'
        updates.preferredDesignStyle = profileData.effects.designStyle || 'minimalist'
      }
      if (profileData.contentType) {
        updates.primaryContentType = profileData.contentType
      }
      if (profileData.targetAudience) {
        updates.targetAudience = profileData.targetAudience
      }
      if (profileData.dislikes?.length) {
        updates.userDislikes = profileData.dislikes
      }
      if (profileData.customRules?.length) {
        updates.customRules = profileData.customRules
      }

      useUserProfileStore.setState(updates)
      setProfileCreated(true)
      addToast('פרופיל עריכה נוצר בהצלחה!', 'success')
    } catch (err: any) {
      addToast(err.message, 'error')
    }
    setParsing(false)
  }

  const apiStatus: ApiStatus | null = apiStatusStore.checked ? {
    openai: { connected: apiStatusStore.openai.connected, chatModel: 'gpt-5.4', transcribeModel: 'gpt-4o-transcribe-diarize' },
    elevenlabs: { connected: apiStatusStore.elevenlabs.connected },
    deepl: { connected: apiStatusStore.deepl.connected },
    gemini: { connected: apiStatusStore.gemini.connected },
    seedance: { connected: apiStatusStore.seedance.connected },
    pixabay: { connected: apiStatusStore.pixabay.connected },
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
      features: ['תמלול (gpt-4o-transcribe-diarize)', 'עוזר AI (GPT-5.4)', 'יצירת תמונות (DALL-E 3)'],
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
    {
      name: 'Google Gemini',
      icon: '🍌',
      key: 'gemini' as const,
      features: ['Nano Banana (תמונות)', 'Veo 3.1 (סרטונים)', 'תמונה לסרטון'],
      description: 'כולל: Nano Banana (תמונות) + Veo (סרטונים)',
    },
    {
      name: 'Seedance 1.5 Pro',
      icon: '🎬',
      key: 'seedance' as const,
      features: ['B-Roll AI (סרטונים)', 'סינמטי + אודיו מקורי', 'ByteDance via kie.ai'],
      description: 'יצירת סרטוני AI סינמטיים עם אודיו. השג API Key מ-kie.ai',
    },
    {
      name: 'Pixabay',
      icon: '🎵',
      key: 'pixabay' as const,
      features: ['חיפוש מוזיקה', 'מוזיקת רקע חינמית'],
      description: 'מוזיקת רקע חינמית לסרטונים',
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

        {activeTab === 'editing-profile' && (
          <div className="space-y-6">
            {/* Section 1: Current Profile Status */}
            <div className="bg-[#1A1A28] rounded-xl p-6" dir="rtl">
              <h3 className="text-lg font-bold text-white mb-4">📊 הפרופיל שלך</h3>

              {/* Confidence bar */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-gray-400">רמת דיוק:</span>
                <div className="h-2 flex-1 bg-white/10 rounded-full">
                  <div className="h-2 bg-purple-500 rounded-full transition-all" style={{ width: `${profile.confidenceScore * 100}%` }} />
                </div>
                <span className="text-sm text-purple-400">{Math.round(profile.confidenceScore * 100)}%</span>
              </div>

              {/* Profile grid */}
              {profile.confidenceScore > 0 ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">✂️ מילות מילוי</div>
                    <div className="text-white">{profile.fillerWordPreference === 'keep' ? 'לא להסיר' : profile.fillerWordPreference === 'remove_most' ? 'להסיר חלק' : 'להסיר הכל'}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">🔇 שתיקות</div>
                    <div className="text-white">{profile.silencePreference === 'keep' ? 'לא לקצר' : profile.silencePreference === 'aggressive' ? 'קיצור אגרסיבי' : 'קיצור מתון'}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">💬 כתוביות</div>
                    <div className="text-white">{profile.captionPreference === 'never' ? 'בלי' : profile.preferredCaptionStyle}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">🖼 B-Roll</div>
                    <div className="text-white">{profile.brollPreference === 'lots' ? 'הרבה' : profile.brollPreference === 'none' ? 'בלי' : 'מעט'}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">🎵 מוזיקה</div>
                    <div className="text-white">{profile.musicPreference === 'never' ? 'בלי' : profile.preferredMusicMood + ' ' + profile.preferredMusicVolume + '%'}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">⚡ קצב</div>
                    <div className="text-white">{profile.preferredCutSpeed === 'fast' ? 'מהיר' : profile.preferredCutSpeed === 'slow' ? 'איטי' : 'בינוני'}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">📐 פורמט</div>
                    <div className="text-white">{profile.preferredFormat}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">🎬 סוג תוכן</div>
                    <div className="text-white">{profile.primaryContentType || 'לא הוגדר'}</div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-center py-4">עדיין אין פרופיל. צור פרופיל עם AI או ערוך סרטונים כדי שהמערכת תלמד.</p>
              )}

              {profile.confidenceScore > 0 && (
                <button onClick={resetProfile} className="mt-4 text-red-400 text-sm hover:text-red-300">
                  🗑 אפס פרופיל
                </button>
              )}
            </div>

            {/* Section 2: AI Profile Builder */}
            <div className="bg-[#1A1A28] rounded-xl p-6" dir="rtl">
              <h3 className="text-lg font-bold text-white mb-2">🤖 צור פרופיל עם AI</h3>
              <p className="text-gray-400 text-sm mb-6">
                העתק את הפרומפט הבא, הדבק אותו ב-ChatGPT או Claude, ענה על השאלות, והדבק את התשובה כאן.
                המערכת תבין בדיוק איך אתה אוהב לערוך.
              </p>

              {/* Step 1: Copy Prompt */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-purple-400">שלב 1: העתק את הפרומפט</span>
                  <button onClick={() => {
                    navigator.clipboard.writeText(PROFILE_PROMPT)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-sm px-4 py-2 rounded-lg transition">
                    {copied ? '✅ הועתק!' : '📋 העתק פרומפט'}
                  </button>
                </div>
                <div className="bg-black/30 rounded-lg p-4 text-sm text-gray-300 max-h-48 overflow-y-auto leading-relaxed border border-white/5">
                  {PROFILE_PROMPT.split('\n').map((line, i) => (
                    <div key={i} className={line.startsWith('#') ? 'font-bold text-white mt-2' : ''}>{line || <br/>}</div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">💡 הדבק ב-ChatGPT, Claude, או כל AI אחר ותענה על השאלות</p>
              </div>

              {/* Step 2: Paste Response */}
              <div className="mb-6">
                <span className="font-medium text-purple-400 block mb-2">שלב 2: הדבק את התשובה מה-AI</span>
                <textarea
                  value={aiResponse}
                  onChange={e => setAiResponse(e.target.value)}
                  placeholder="הדבק כאן את כל התשובה שקיבלת מ-ChatGPT או Claude..."
                  className="w-full h-48 bg-black/30 text-white rounded-lg p-4 text-sm resize-none focus:ring-2 focus:ring-purple-500 border border-white/5 placeholder-gray-600"
                  dir="rtl"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {aiResponse.length > 0 ? `${aiResponse.length} תווים` : 'מחכה לתשובה...'}
                </p>
              </div>

              {/* Step 3: Create Profile */}
              <button
                onClick={parseAndApplyProfile}
                disabled={!aiResponse.trim() || parsing}
                className={`w-full py-3 rounded-lg font-bold transition ${
                  aiResponse.trim() && !parsing
                    ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {parsing ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    מנתח תשובה ויוצר פרופיל...
                  </span>
                ) : '🚀 צור פרופיל מהתשובה'}
              </button>

              {profileCreated && (
                <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-green-400 font-bold">✅ פרופיל עריכה נוצר בהצלחה!</p>
                  <p className="text-gray-400 text-sm mt-1">העוזר האישי והעריכה האוטומטית יעבדו לפי ההעדפות שלך מעכשיו.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <AIEvolutionSettings />
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-accent-blue to-bg-panel rounded-xl p-6 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">יוצר</h3>
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
                  {billingHistory.length === 0 ? (
                    <tr><td colSpan={3} className="p-4 text-center text-text-muted text-xs">אין היסטוריית חיובים</td></tr>
                  ) : billingHistory.map((item, i) => (
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
              {teamMembers.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <Users size={32} className="mx-auto text-text-muted opacity-30" />
                  <p className="text-sm text-text-muted">אין חברי צוות</p>
                  <p className="text-xs text-text-muted">הוסף חברי צוות לעבודה משותפת</p>
                </div>
              ) : teamMembers.map((member, i) => (
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
                <option>עורך</option>
                <option>צופה</option>
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
