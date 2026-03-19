import { useState, useEffect, useRef } from 'react'
import { Video, Music, Sparkles, Film, ArrowRight, X, Type } from 'lucide-react'
import type { AutoEditorInput } from '../store/autoEditorStore'
import { useAutoEditorStore } from '../store/autoEditorStore'
import { useUserProfileStore } from '../../../stores/userProfileStore'

const SUBTITLE_STYLE_OPTIONS = [
  { id: 'bold_pop', label: 'Bold Pop', icon: Type, description: 'מילה-מילה עם אפקט פופ' },
  { id: 'neon_glow', label: 'Neon Glow', icon: Sparkles, description: 'זוהר ניאון עם הזזה' },
  { id: 'boxing', label: 'Boxing', icon: Film, description: 'כל מילה בקופסה צבעונית' },
  { id: 'minimal', label: 'Minimal', icon: Type, description: 'נקי ומינימליסטי' },
  { id: 'karaoke', label: 'Karaoke', icon: Music, description: 'מילים מוארות בזמן אמת' },
] as const

const CONTENT_TYPE_SUBTITLE_MAP: Record<string, string> = {
  product_sales: 'bold_pop',
  tiktok_reels: 'boxing',
  youtube_shorts: 'neon_glow',
  story: 'neon_glow',
  tutorial: 'minimal',
  podcast: 'minimal',
  interview: 'minimal',
  presentation: 'minimal',
  company_intro: 'minimal',
  customer_testimonial: 'minimal',
  employee_training: 'minimal',
}

const LANGUAGE_OPTIONS = [
  { id: 'he', label: 'עברית', flag: '🇮🇱' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'ar', label: 'العربية', flag: '🇸🇦' },
  { id: 'multi', label: 'מעורב (מספר שפות)', flag: '🌍', description: 'אנגלית, ספרדית, צרפתית, גרמנית, הינדי, רוסית, פורטוגזית, יפנית, איטלקית, הולנדית' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'pt', label: 'Português', flag: '🇧🇷' },
  { id: 'it', label: 'Italiano', flag: '🇮🇹' },
  { id: 'ja', label: '日本語', flag: '🇯🇵' },
  { id: 'ko', label: '한국어', flag: '🇰🇷' },
  { id: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { id: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { id: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { id: 'detect', label: 'זיהוי אוטומטי', flag: '🔍', description: 'המערכת תזהה את השפה אוטומטית' },
]

interface LocalFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  type: 'video' | 'audio'
  nativeFile: File
}

interface AutoEditorSettingsProps {
  files: LocalFile[]
  onStart: (input: Omit<AutoEditorInput, 'videoUrls'>) => void
  onBack: () => void
  onClose?: () => void
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 שנ׳', desc: 'Story / Reel' },
  { value: 30, label: '30 שנ׳', desc: 'TikTok / Reel' },
  { value: 60, label: '60 שנ׳', desc: 'Reel / Short' },
  { value: 90, label: '90 שנ׳', desc: 'YouTube Short' },
  { value: 180, label: '3 דקות', desc: 'YouTube' },
  { value: -1, label: '🤖 AI בוחר', desc: 'הזמן האופטימלי' },
  { value: 0, label: 'מותאם', desc: 'הזן ידנית' },
]

const BROLL_MODEL_OPTIONS = [
  { id: 'wan', label: 'WAN 2.5', cost: 0.10, quality: '720p', speed: '30-60 שניות', icon: '💰', badge: 'הכי זול' },
  { id: 'kling', label: 'Kling v2.5 Turbo', cost: 0.15, quality: '720p', speed: '1 דקה', icon: '🎯', badge: 'מומלץ' },
  { id: 'seedance', label: 'Seedance 1.5 Pro', cost: 0.36, quality: '720p', speed: '1-2 דקות', icon: '🌱', badge: '' },
  { id: 'veo-3.1-fast', label: 'Veo 3.1 Fast', cost: 0.40, quality: '720p', speed: '1-2 דקות', icon: '⚡', badge: '' },
  { id: 'sora-2', label: 'Sora 2', cost: 0.50, quality: '720p', speed: '2-3 דקות', icon: '🌀', badge: '' },
  { id: 'veo-3.1-quality', label: 'Veo 3.1 Quality', cost: 2.00, quality: '1080p', speed: '3-5 דקות', icon: '🎬', badge: 'הכי איכותי' },
]

const FORMAT_OPTIONS = [
  {
    id: 'portrait',
    label: '9:16 עמודי',
    description: 'Reels, TikTok, Shorts, Stories',
    ratio: '9:16',
    icon: '📱',
    platforms: ['reels', 'tiktok', 'shorts', 'story'],
  },
  {
    id: 'landscape',
    label: '16:9 רחב',
    description: 'YouTube, Facebook, X/Twitter',
    ratio: '16:9',
    icon: '🖥️',
    platforms: ['youtube', 'facebook', 'twitter'],
  },
  {
    id: 'square',
    label: '1:1 מרובע',
    description: 'LinkedIn, Instagram Feed',
    ratio: '1:1',
    icon: '⬜',
    platforms: ['linkedin'],
  },
]

interface ContentTypeItem {
  id: string
  label: string
  prompt: string
}

const CONTENT_TYPES: Record<string, ContentTypeItem[]> = {
  business: [
    {
      id: 'company_intro',
      label: 'סרטון תדמית לחברה',
      prompt: `ערוך סרטון תדמית מקצועי לחברה.
פתיחה: הוק חזק ב-2 שניות הראשונות - תוצאה מרשימה או הבטחה ברורה.
מבנה: בעיה → פתרון → הוכחה → קריאה לפעולה.
קצב: עריכה דינמית עם חיתוכים כל 3-4 שניות.
B-Roll: הכנס קטעי הדגמה/תוצאות בין דברי הפרזנטור.
צבע: גווני צבע חמים ומקצועיים, קונטרסט גבוה.
מוזיקה: מוזיקת רקע תאגידית מעוררת השראה, ווליום 12-15%.
כתוביות: בולטות עם הדגשת מילות מפתח בצבע.
סיום: CTA ברור וחזק עם לוגו.`,
    },
    {
      id: 'product_sales',
      label: 'סרטון מכירות למוצר',
      prompt: `ערוך סרטון מכירות ממיר למוצר.
פתיחה: הוק רגשי - בעיה שהצופה מזדהה איתה, או תוצאה "לפני/אחרי".
מבנה: כאב → הגדלת הכאב → הצגת הפתרון → הוכחה חברתית → דחיפות → CTA.
קצב: מהיר עם חיתוכים כל 2-3 שניות בחלק הראשון, איטי יותר בהסבר המוצר.
B-Roll: הדגמות מוצר, תגובות לקוחות, שימוש בפועל.
זומים: זום על המוצר בכל פעם שמוזכר שם או תכונה חשובה.
צבע: חי ומושך, גוון שמתאים למיתוג המוצר.
כתוביות: מילות מפתח מודגשות בצבע, מספרים ונתונים בולטים.
סיום: CTA עם תחושת דחיפות ("עכשיו", "מוגבל", "היום").`,
    },
    {
      id: 'customer_testimonial',
      label: 'סרטון לקוחות ממליצים',
      prompt: `ערוך סרטון עדויות לקוחות שבונה אמון.
פתיחה: ציטוט חזק של לקוח או תוצאה מספרית מרשימה.
מבנה: ציטוט פתיחה → הצגת הבעיה → איך השירות עזר → תוצאות → המלצה.
קצב: רגוע יותר, חיתוכים כל 4-5 שניות. תנו למילים לנשום.
B-Roll: תמונות של הלקוח, התוצאות שלו, לפני/אחרי.
זומים: זום עדין כשהלקוח אומר משהו רגשי או חזק.
צבע: חם וטבעי, מרגיש אותנטי ולא "מלוטש מדי".
כתוביות: ציטוטים חשובים מודגשים בצבע שונה.
סיום: "גם אתה יכול" + CTA.`,
    },
    {
      id: 'employee_training',
      label: 'סרטון הדרכה לעובדים',
      prompt: `ערוך סרטון הדרכה ברור ומסודר.
פתיחה: מה הצופה ילמד ולמה זה חשוב - ב-3 שניות.
מבנה: מבוא → שלב 1 → שלב 2 → שלב 3 → סיכום.
קצב: מתון ויציב, חיתוכים כל 5-6 שניות. לא למהר.
B-Roll: הדגמות מעשיות, מסכים, דיאגרמות.
זומים: זום על פרטים חשובים (כפתורים, טקסט, פעולות).
צבע: נקי ומקצועי, לא דרמטי.
כתוביות: כל שלב ממוספר, מילות מפתח מודגשות.
גרפיקות: מספור שלבים על המסך, חיצים, הדגשות.
סיום: סיכום 3 הנקודות העיקריות.`,
    },
  ],
  social: [
    {
      id: 'tiktok_reels',
      label: 'TikTok / Reels',
      prompt: `ערוך סרטון ויראלי לרילס/טיקטוק.
פתיחה: הוק ב-1 שנייה! שאלה מסקרנת, מספר מפתיע, או ויזואל תופס עין.
מבנה: הוק → תוכן מפתיע → תפנית → סיום שגורם לשיתוף.
קצב: מהיר מאוד! חיתוכים כל 1.5-2 שניות. אנרגיה גבוהה.
B-Roll: ויזואלים דינמיים, אפקטים, תנועה מתמדת.
זומים: זומים תכופים כל 3-4 שניות, אינטנסיביות 1.2-1.4x.
צבע: צבעוני וחי, קונטרסט גבוה, רוויה 110%.
כתוביות: גדולות ובולטות, מילה-מילה עם אנימציית pop.
מוזיקה: טרנדית וקצבית, ווליום 15-20%.
סיום: loop - חזרה חלקה לתחילת הסרטון, או CTA "שמור/שתף".`,
    },
    {
      id: 'youtube_shorts',
      label: 'YouTube Shorts',
      prompt: `ערוך YouTube Short שמושך צפיות.
פתיחה: הוק ויזואלי ב-2 שניות - טקסט על המסך + דיבור.
מבנה: הבטחה → תוכן → הפתעה → CTA להירשם.
קצב: מהיר אבל קצת יותר נשימה מטיקטוק, חיתוכים כל 2-3 שניות.
B-Roll: הדגמות, תמונות, אנימציות קלות.
זומים: זום על נקודות חשובות, אלטרנטיבה בין wide ו-closeup.
צבע: מקצועי ונקי, מתאים ל-YouTube.
כתוביות: ברורות עם רקע שקוף, ממוקמות מתחת לסנטר.
סיום: "Subscribe" + תוכן נוסף שמעניין.`,
    },
    {
      id: 'story',
      label: 'סטורי',
      prompt: `ערוך סטורי קצר ותופס.
פתיחה: ויזואל מלא מסך ב-0.5 שנייה ראשונה.
מבנה: רגע אחד חזק → הסבר קצר → CTA.
קצב: מהיר מאוד, כל פריים חשוב. מקסימום 15 שניות.
צבע: חי, פילטרים אינסטגרמיים.
כתוביות: גדולות, מרכז מסך, מקסימום 4 מילים בפריים.
סיום: "החלק למעלה" או "הקש לעוד".`,
    },
  ],
  content: [
    {
      id: 'podcast',
      label: 'פודקאסט',
      prompt: `ערוך קליפ מפודקאסט לסושיאל.
פתיחה: הרגע הכי מעניין/מצחיק/מפתיע מהשיחה.
מבנה: ציטוט חזק → הקשר → פיתוח → תובנה.
קצב: טבעי, לא לחתוך יותר מדי. חיתוכים רק על החלפת דובר או נקודה חדשה.
זוויות מצלמה: החלפת זווית כל 2-3 משפטים בין הדוברים.
זומים: זום עדין כשמישהו אומר משהו חזק.
צבע: חם וביתי, מרגיש אינטימי.
כתוביות: חובה! 90% צופים בלי סאונד. הדגשת ציטוטים חזקים.
מוזיקה: מינימלית, רק ברקע ובמעברים.`,
    },
    {
      id: 'interview',
      label: 'ראיון',
      prompt: `ערוך ראיון מקצועי וזורם.
פתיחה: התשובה הכי מעניינת של המרואיין, לא השאלה.
מבנה: תשובה חזקה → שאלה + תשובה → שאלה + תשובה → תובנת סיום.
קצב: הסר את השאלות הארוכות, השאר רק תשובות עם שאלות קצרות.
זוויות: החלפת זווית בין שואל למרואיין, קלוזאפ על רגעות רגשיים.
B-Roll: הכנס בין תשובות למעברים חלקים.
כתוביות: שם + תפקיד של כל דובר בתחילת הופעתו.
צבע: מקצועי וחד.`,
    },
    {
      id: 'presentation',
      label: 'הרצאה / וובינר',
      prompt: `ערוך הרצאה לסרטון קצר ומרוכז.
פתיחה: התובנה המרכזית או ההבטחה של ההרצאה ב-3 שניות.
מבנה: תובנה מרכזית → 3 נקודות תומכות → סיכום → CTA.
קצב: מתון, חיתוכים כל 5-6 שניות. הסר חלקים שחוזרים על עצמם.
זומים: זום על הדובר בנקודות מפתח.
B-Roll: שקפים, גרפים, דוגמאות ויזואליות.
כתוביות: כל נקודה מפתח מופיעה כטקסט על המסך.
גרפיקות: מספור נקודות (1/3, 2/3, 3/3).
סיום: סיכום + קישור להרצאה המלאה.`,
    },
    {
      id: 'tutorial',
      label: 'הדרכה / טוטוריאל',
      prompt: `ערוך טוטוריאל ברור וקל לעקוב.
פתיחה: "בסוף הסרטון תדע איך ל..." + תוצאה סופית (1-2 שניות).
מבנה: תוצאה → שלב 1 → שלב 2 → שלב 3 → תוצאה סופית.
קצב: ברור ומתון, חיתוכים בין שלבים. הסר היסוסים ומילוי.
זומים: זום חזק על פרטים (מסכים, כפתורים, פעולות ידיים).
B-Roll: צילומי מסך, הדגמות, לפני/אחרי.
כתוביות: כל שלב ממוספר, highlight על מילות מפתח.
גרפיקות: חיצים, עיגולים, הדגשות על אזורים חשובים.
סיום: "עכשיו תורך! נסה בעצמך" + CTA.`,
    },
  ],
}

const CONTENT_CATEGORIES = [
  { key: 'business', title: 'עסקי' },
  { key: 'social', title: 'סושיאל' },
  { key: 'content', title: 'תוכן' },
]

interface ProfessionalOption {
  id: string
  label: string
  description: string
  icon: string
  promptAddition: string
  defaultOn?: boolean
}

const PROFESSIONAL_OPTIONS: ProfessionalOption[] = [
  // === VISUAL ===
  {
    id: 'background_image',
    label: 'תמונת רקע AI',
    description: 'יצירת תמונת רקע מותאמת לתוכן הסרטון',
    icon: '🖼️',
    promptAddition: 'צור תמונת רקע מקצועית שמתאימה לתוכן הסרטון. התמונה צריכה להיות בסגנון soft-focus, ללא אנשים, ללא טקסט.',
  },
  {
    id: 'background_blur',
    label: 'טשטוש רקע',
    description: 'אפקט עומק שדה - הפרזנטור בולט מהרקע',
    icon: '🔍',
    promptAddition: 'הוסף אפקט עומק שדה (DOF): טשטוש עדין על הרקע כדי שהפרזנטור יבלוט. שמור על חדות הפנים.',
  },
  {
    id: 'cinematic',
    label: 'סינמטי',
    description: 'צבע קולנועי, מעברים חלקים, פסים שחורים',
    icon: '🎬',
    promptAddition: 'סגנון קולנועי: color grade חם עם כחולים בצללים, טשטוש רקע חזק, מעברים dissolve.',
  },
  {
    id: 'eye_contact',
    label: 'שמירה על קשר עין',
    description: 'העדפת קטעים שהדובר מסתכל למצלמה',
    icon: '👁️',
    promptAddition: 'העדף קטעים שבהם הדובר מסתכל ישר למצלמה. אם יש קטע שהדובר מסתכל הצידה, העדף קטע חלופי.',
  },

  // === PACE & ENERGY ===
  {
    id: 'energy_boost',
    label: 'הגברת אנרגיה',
    description: 'קצב מהיר, חיתוכים תכופים, זומים דינמיים',
    icon: '⚡',
    promptAddition: 'הגבר אנרגיה: חיתוכים כל 2 שניות, זומים 1.3x כל 4 שניות, מוזיקה קצבית 18%.',
  },
  {
    id: 'calm_professional',
    label: 'רגוע ומקצועי',
    description: 'קצב מתון, עריכה נקייה, מינימליסטי',
    icon: '🎩',
    promptAddition: 'שמור על קצב רגוע: חיתוכים כל 5-6 שניות, זומים עדינים 1.1x, מוזיקה שקטה 10%.',
  },
  {
    id: 'remove_silence',
    label: 'הסרת שתיקות',
    description: 'קיצור שתיקות ארוכות מעל 1.5 שניות',
    icon: '🔇',
    promptAddition: 'הסר שתיקות ארוכות מ-1.5 שניות. קצר הפסקות בין משפטים ל-0.3 שניות.',
  },

  // === TEXT & SUBTITLES ===
  {
    id: 'subtitles_hebrew',
    label: 'כתוביות בעברית',
    description: 'כתוביות מונפשות עם הדגשת מילות מפתח',
    icon: '📝',
    promptAddition: 'כתוביות בעברית מונפשות, מילות מפתח מודגשות בצבע, ממוקמות מתחת לסנטר.',
    defaultOn: true,
  },

  // === AUDIO ===
  {
    id: 'music_energetic',
    label: 'מוזיקת רקע אנרגטית',
    description: 'מוזיקה קצבית ומעוררת',
    icon: '🎵',
    promptAddition: 'מוזיקת רקע אנרגטית, ווליום 15-18%, חיתוכים מסונכרנים עם הביט.',
  },
  {
    id: 'music_calm',
    label: 'מוזיקת רקע רגועה',
    description: 'מוזיקה שקטה ונעימה ברקע',
    icon: '🎶',
    promptAddition: 'מוזיקת רקע רגועה ונעימה, ווליום 8-12%, לא מפריעה לדיבור.',
  },

  // === STYLE ===
  {
    id: 'trending',
    label: 'טרנדי',
    description: 'סגנון עדכני לפי הטרנדים האחרונים',
    icon: '🔥',
    promptAddition: 'סגנון עריכה טרנדי: אפקטים פופולריים, חיתוכים על הביט, טקסט מונפש, זום מהיר.',
  },

  // === AI AD ===
  {
    id: 'ai_ad_video',
    label: 'סרטון פרסומת AI',
    description: 'הוסף סצנות וידאו AI מותאמות לתסריט',
    icon: '🎬',
    promptAddition: 'שלב סצנות וידאו AI מיוצרות (Cinematic painterly animation, photorealistic, Israeli urban, 9:16) בין חלקי הסרטון.',
  },
]

const CONTENT_TYPE_RECOMMENDATIONS: Record<string, string[]> = {
  // Business
  company_intro: ['background_blur', 'cinematic', 'calm_professional', 'subtitles_hebrew', 'music_calm', 'background_image', 'ai_ad_video'],
  product_sales: ['energy_boost', 'subtitles_hebrew', 'music_energetic', 'background_image', 'eye_contact', 'ai_ad_video'],
  customer_testimonial: ['background_blur', 'calm_professional', 'subtitles_hebrew', 'music_calm', 'eye_contact'],
  employee_training: ['calm_professional', 'subtitles_hebrew', 'remove_silence', 'eye_contact'],

  // Social
  tiktok_reels: ['energy_boost', 'subtitles_hebrew', 'music_energetic', 'trending'],
  youtube_shorts: ['energy_boost', 'subtitles_hebrew', 'music_energetic', 'background_blur'],
  story: ['energy_boost', 'subtitles_hebrew', 'trending', 'music_energetic'],

  // Content
  podcast: ['calm_professional', 'subtitles_hebrew', 'music_calm', 'remove_silence'],
  interview: ['background_blur', 'calm_professional', 'subtitles_hebrew', 'eye_contact'],
  presentation: ['calm_professional', 'subtitles_hebrew', 'remove_silence', 'background_image'],
  tutorial: ['subtitles_hebrew', 'remove_silence', 'calm_professional', 'eye_contact'],
}

export interface LogoData {
  file: File | null
  url: string | null
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  size: 'small' | 'medium' | 'large'
  opacity: number
}

function LogoUpload({ logo, onLogoChange }: {
  logo: LogoData | null
  onLogoChange: (logo: LogoData | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      return
    }

    const url = URL.createObjectURL(file)
    onLogoChange({
      file,
      url,
      position: 'top-right',
      size: 'medium',
      opacity: 0.9,
    })
  }

  function removeLogo() {
    if (logo?.url) {
      URL.revokeObjectURL(logo.url)
    }
    onLogoChange(null)
  }

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏷️</span>
        <h4 className="text-white text-sm font-bold">לוגו</h4>
        <span className="text-gray-500 text-xs">(אופציונלי)</span>
      </div>

      {logo?.url ? (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <img
            src={logo.url}
            alt="Logo"
            className="w-12 h-12 object-contain rounded bg-white/10 p-1"
          />
          <div className="flex-1">
            <div className="text-white text-sm">{logo.file?.name}</div>

            <div className="flex gap-1 mt-2">
              {([
                { id: 'top-right' as const, label: '↗ ימין למעלה' },
                { id: 'top-left' as const, label: '↖ שמאל למעלה' },
                { id: 'bottom-right' as const, label: '↘ ימין למטה' },
                { id: 'bottom-left' as const, label: '↙ שמאל למטה' },
              ]).map(pos => (
                <button
                  key={pos.id}
                  onClick={() => onLogoChange({ ...logo, position: pos.id })}
                  className={`px-2 py-1 rounded text-[10px] ${
                    logo.position === pos.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            <div className="flex gap-1 mt-1">
              {([
                { id: 'small' as const, label: 'קטן' },
                { id: 'medium' as const, label: 'בינוני' },
                { id: 'large' as const, label: 'גדול' },
              ]).map(s => (
                <button
                  key={s.id}
                  onClick={() => onLogoChange({ ...logo, size: s.id })}
                  className={`px-2 py-1 rounded text-[10px] ${
                    logo.size === s.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={removeLogo}
            className="text-gray-500 hover:text-red-400 text-sm"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 rounded-xl border-2 border-dashed border-white/20 hover:border-purple-500/50 text-center transition"
        >
          <span className="text-gray-400 text-sm">📎 לחץ להעלאת לוגו</span>
          <div className="text-gray-600 text-xs mt-1">PNG, JPG, SVG</div>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}

function BrandImageUpload() {
  const { brandImages, addBrandImage, removeBrandImage, setBrandImages } = useAutoEditorStore()

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const remaining = 5 - brandImages.length
    const toAdd = Array.from(files).slice(0, remaining)
    toAdd.forEach(file => {
      if (!file.type.startsWith('image/')) return
      addBrandImage({
        file,
        previewUrl: URL.createObjectURL(file),
        description: '',
      })
    })
    e.target.value = ''
  }

  function updateDescription(index: number, description: string) {
    const updated = brandImages.map((img, i) =>
      i === index ? { ...img, description } : img
    )
    setBrandImages(updated)
  }

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="text-lg">🖼️</span>
        <h4 className="text-white text-sm font-bold">תמונות למותג (אופציונלי)</h4>
      </div>
      <p className="text-gray-500 text-xs">
        העלה תמונות מוצר, לוגו, או צוות - המערכת תהפוך אותן לקליפים מונפשים ותכניס אותם כ-B-Roll
      </p>

      <div className="grid grid-cols-3 gap-2">
        {brandImages.map((img, i) => (
          <div key={i} className="relative aspect-video rounded-lg border border-white/10 overflow-hidden">
            <img src={img.previewUrl} className="w-full h-full object-cover" alt="" />
            <input
              placeholder="תיאור (אופציונלי)"
              value={img.description}
              onChange={e => updateDescription(i, e.target.value)}
              className="absolute bottom-0 w-full bg-black/60 text-white text-xs p-1 border-none outline-none"
            />
            <button
              onClick={() => removeBrandImage(i)}
              className="absolute top-1 left-1 bg-black/50 rounded-full w-5 h-5 flex items-center justify-center text-red-400 text-xs hover:bg-black/80 transition"
            >
              ✕
            </button>
          </div>
        ))}
        {brandImages.length < 5 && (
          <label className="aspect-video rounded-lg border border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-purple-500 transition">
            <span className="text-gray-500 text-2xl">+</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        )}
      </div>
    </div>
  )
}

export function buildAutoEditorPrompt(
  contentType: ContentTypeItem | null,
  selectedFormats: string[],
  selectedOptions: string[],
): string {
  let prompt = ''

  if (contentType?.prompt) {
    prompt += contentType.prompt + '\n\n'
  }

  if (selectedFormats.includes('portrait')) {
    prompt += 'פורמט: 9:16 עמודי (Reels/TikTok/Shorts). כתוביות גדולות, אלמנטים במרכז.\n'
  }
  if (selectedFormats.includes('landscape')) {
    prompt += 'פורמט: 16:9 רחב (YouTube/Facebook). יש מרחב לגרפיקות בצדדים.\n'
  }
  if (selectedFormats.includes('square')) {
    prompt += 'פורמט: 1:1 מרובע (LinkedIn/Feed). כתוביות בתחתית, תמונה מרוכזת.\n'
  }

  const optionPrompts = selectedOptions
    .map(id => PROFESSIONAL_OPTIONS.find(o => o.id === id)?.promptAddition)
    .filter(Boolean)

  if (optionPrompts.length > 0) {
    prompt += '\nהנחיות נוספות:\n'
    prompt += optionPrompts.join('\n')
  }

  return prompt
}

function EvolutionBadge() {
  return null
}

function PromptBuilder({ prompt, setPrompt, onContentTypeSelect }: {
  prompt: string
  setPrompt: (p: string) => void
  onContentTypeSelect: (ct: ContentTypeItem) => void
}) {
  return (
    <div dir="rtl" className="space-y-4">
      {CONTENT_CATEGORIES.map(cat => (
        <div key={cat.key}>
          <h4 className="text-xs text-gray-500 mb-2">{cat.title}</h4>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES[cat.key].map(ct => (
              <button key={ct.id} onClick={() => {
                onContentTypeSelect(ct)
              }}
                className="bg-white/5 border border-white/10 text-gray-300 text-xs px-3 py-1.5 rounded-full hover:border-purple-500/30 hover:bg-purple-500/10 transition">
                {ct.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-medium text-white">הפרומפט שלך:</h4>
          {prompt && (
            <button onClick={() => setPrompt('')} className="text-xs text-gray-500 hover:text-red-400">
              נקה
            </button>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="תאר בקצרה מה אתה רוצה. אחרי התמלול ה-AI ישפר אוטומטית..."
          className="w-full h-24 bg-black/30 text-white rounded-xl p-4 text-sm resize-none border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
          dir="rtl"
        />
        <p className="text-xs text-gray-600 text-center mt-1">
          הפרומפט ישתפר אוטומטית אחרי התמלול בהתאם לתוכן הסרטון
        </p>
      </div>
    </div>
  )
}

function estimateDuration(files: LocalFile[]): number {
  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0)
  return Math.round(totalBytes / (10 * 1024 * 1024)) * 60
}

function estimateMaxVideos(files: LocalFile[], targetDuration: number): number {
  if (targetDuration <= 0) return 1
  const estimated = estimateDuration(files)
  const available = estimated * 0.7
  return Math.max(1, Math.floor(available / targetDuration))
}

export default function AutoEditorSettings({ files, onStart, onBack, onClose }: AutoEditorSettingsProps) {
  const profile = useUserProfileStore()
  const { language: selectedLanguage, setLanguage: setSelectedLanguage, expectedSpeakers, setExpectedSpeakers, subtitleStyle, setSubtitleStyle } = useAutoEditorStore()
  const [userPrompt, setUserPrompt] = useState('')
  const [selectedContentType, setSelectedContentType] = useState<ContentTypeItem | null>(null)
  const [targetDuration, setTargetDuration] = useState(-1)
  const [customDuration, setCustomDuration] = useState('')
  const [numberOfVideos, setNumberOfVideos] = useState(1)
  const [brollModel, setBrollModel] = useState('kling')
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['portrait'])
  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    PROFESSIONAL_OPTIONS.filter(opt => opt.defaultOn).map(opt => opt.id)
  )
  const [recommendedOptions, setRecommendedOptions] = useState<string[]>([])
  const [logo, setLogo] = useState<LogoData | null>(null)

  const closeHandler = onClose || onBack

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHandler()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeHandler])

  const effectiveDuration = targetDuration === 0 ? (parseInt(customDuration) || 60) : targetDuration
  const maxVideos = estimateMaxVideos(files, effectiveDuration)

  const toggleFormat = (id: string) => {
    setSelectedFormats(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  const toggleOption = (id: string) => {
    setSelectedOptions(prev => {
      let next = prev.includes(id)
        ? prev.filter(o => o !== id)
        : [...prev, id]

      // Music options are mutually exclusive
      if (id === 'music_energetic' && next.includes('music_energetic')) {
        next = next.filter(o => o !== 'music_calm')
      }
      if (id === 'music_calm' && next.includes('music_calm')) {
        next = next.filter(o => o !== 'music_energetic')
      }

      // Energy options are mutually exclusive
      if (id === 'energy_boost' && next.includes('energy_boost')) {
        next = next.filter(o => o !== 'calm_professional')
      }
      if (id === 'calm_professional' && next.includes('calm_professional')) {
        next = next.filter(o => o !== 'energy_boost')
      }

      return next
    })
  }

  const handleContentTypeChange = (ct: ContentTypeItem) => {
    setSelectedContentType(ct)
    setUserPrompt(ct.prompt)

    const recommendations = CONTENT_TYPE_RECOMMENDATIONS[ct.id] || []
    setSelectedOptions(recommendations)
    setRecommendedOptions(recommendations)

    // Set recommended subtitle style for content type
    const recommendedStyle = CONTENT_TYPE_SUBTITLE_MAP[ct.id] || 'bold_pop'
    setSubtitleStyle(recommendedStyle)

    console.log(`[SETTINGS] Content type: ${ct.id} → recommended: ${recommendations.join(', ')}, subtitleStyle: ${recommendedStyle}`)
  }

  // Derive platforms from selected formats
  const derivedPlatforms = selectedFormats.flatMap(
    fId => FORMAT_OPTIONS.find(f => f.id === fId)?.platforms || []
  )

  const handleStart = () => {
    if (selectedFormats.length === 0) return

    const fullPrompt = buildAutoEditorPrompt(selectedContentType, selectedFormats, selectedOptions)
    const finalPrompt = userPrompt || fullPrompt
    console.log('[AUTO-EDITOR] Generated prompt:', finalPrompt.substring(0, 200) + '...')

    // Derive subtitle/background flags from selectedOptions
    const includeSubtitles = selectedOptions.includes('subtitles_hebrew')
    const includeBackground = selectedOptions.includes('background_image')

    const { brandImages } = useAutoEditorStore.getState()

    onStart({
      userPrompt: finalPrompt,
      targetDuration: effectiveDuration,
      numberOfVideos,
      brollModel,
      platforms: derivedPlatforms,
      includeSubtitles,
      includeBackground,
      animatedSubtitles: includeSubtitles,
      animationStyle: subtitleStyle || 'bold_pop',
      subtitleStyle: subtitleStyle || 'bold_pop',
      selectedFormats,
      selectedOptions,
      logo: logo ? {
        file: logo.file,
        url: logo.url,
        position: logo.position,
        size: logo.size,
        opacity: logo.opacity,
      } : undefined,
      brandImages: brandImages.length > 0 ? brandImages : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto flex items-start justify-center">
      <div className="w-full max-w-2xl mx-auto p-8 relative" dir="rtl">
        {/* Close button */}
        <button
          onClick={closeHandler}
          className="absolute top-6 left-6 text-gray-400 hover:text-white text-xl transition-colors"
          aria-label="סגור"
        >
          <X size={20} />
        </button>

        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1 px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-white/[0.05]"
        >
          <ArrowRight size={16} />
          חזרה
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-pink/20 flex items-center justify-center border border-accent-purple/20">
            <Sparkles size={28} className="text-accent-purple" />
          </div>
          <h2 className="text-xl font-bold text-text-primary">עריכה אוטומטית</h2>
          <p className="text-sm text-text-muted">AI יערוך את הסרטונים שלך אוטומטית</p>
        </div>

        <EvolutionBadge />

        <div className="w-full space-y-6">
          {/* Selected files */}
          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-2">
            <h3 className="text-sm font-medium text-text-secondary">קבצים שנבחרו:</h3>
            <div className="space-y-1.5">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-2 text-sm">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-green-400 text-xs">✓</span>
                  </div>
                  {file.type === 'video' ? (
                    <Video size={14} className="text-accent-blue shrink-0" />
                  ) : (
                    <Music size={14} className="text-accent-purple shrink-0" />
                  )}
                  <span className="text-text-primary truncate flex-1">{file.name}</span>
                  <span className="text-text-muted text-xs">{file.size}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt Builder with content type chips */}
          <PromptBuilder
            prompt={userPrompt}
            setPrompt={setUserPrompt}
            onContentTypeSelect={handleContentTypeChange}
          />

          {/* Format selection (replaces platform selection) */}
          <div className="space-y-3">
            <h4 className="text-white text-sm font-bold">פורמט ייצוא</h4>
            <p className="text-gray-500 text-xs">בחר פורמט אחד או יותר:</p>

            <div className="grid grid-cols-3 gap-3">
              {FORMAT_OPTIONS.map(format => (
                <button
                  key={format.id}
                  onClick={() => toggleFormat(format.id)}
                  className={`p-4 rounded-xl border-2 text-center transition ${
                    selectedFormats.includes(format.id)
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/30'
                  }`}
                >
                  <span className="text-2xl">{format.icon}</span>
                  <div className="text-white text-sm font-bold mt-1">{format.label}</div>
                  <div className="text-gray-400 text-xs mt-1">{format.description}</div>
                  {selectedFormats.includes(format.id) && (
                    <span className="text-purple-400 text-xs mt-1 block">✓</span>
                  )}
                </button>
              ))}
            </div>
            {selectedFormats.length === 0 && (
              <p className="text-xs text-red-400">יש לבחור לפחות פורמט אחד</p>
            )}
          </div>

          {/* Language selector */}
          <div className="space-y-2" dir="rtl">
            <h4 className="text-white text-sm font-bold">🌐 שפת הסרטון</h4>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            >
              {LANGUAGE_OPTIONS.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.flag} {lang.label}
                </option>
              ))}
            </select>
            {selectedLanguage === 'multi' && (
              <p className="text-gray-500 text-xs">תומך ב: אנגלית, ספרדית, צרפתית, גרמנית, הינדי, רוסית, פורטוגזית, יפנית, איטלקית, הולנדית</p>
            )}
            {selectedLanguage === 'detect' && (
              <p className="text-gray-500 text-xs">המערכת תזהה את השפה אוטומטית</p>
            )}
          </div>

          {/* Expected speakers selector */}
          <div className="flex items-center gap-2" dir="rtl">
            <span className="text-white text-xs">מספר דוברים משוער:</span>
            <select
              value={expectedSpeakers}
              onChange={e => setExpectedSpeakers(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded p-1 text-white text-xs"
            >
              <option value={0}>אוטומטי</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5+</option>
            </select>
          </div>

          {/* Professional options */}
          <div className="space-y-3">
            <h4 className="text-white text-sm font-bold">אפשרויות מקצועיות</h4>
            {recommendedOptions.length > 0 && (
              <p className="text-purple-400 text-xs">
                ✨ {recommendedOptions.length} אפשרויות מומלצות לסגנון שבחרת - אפשר לשנות
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              {PROFESSIONAL_OPTIONS.map(opt => {
                const isSelected = selectedOptions.includes(opt.id)
                const isRecommended = recommendedOptions.includes(opt.id)

                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleOption(opt.id)}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-right transition relative ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/30'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0">{opt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-white text-xs font-medium">{opt.label}</span>
                        {isRecommended && (
                          <span className="text-[9px] bg-purple-600/60 text-purple-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            מומלץ לסגנון
                          </span>
                        )}
                      </div>
                      <div className="text-gray-500 text-[10px] truncate">{opt.description}</div>
                    </div>
                    {isSelected && (
                      <span className="text-purple-400 text-sm flex-shrink-0">✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Subtitle style selector - only show when subtitles are enabled */}
          {selectedOptions.includes('subtitles_hebrew') && (
            <div className="space-y-3">
              <h4 className="text-white text-sm font-bold">סגנון כתוביות</h4>
              <div className="grid grid-cols-5 gap-2">
                {SUBTITLE_STYLE_OPTIONS.map(opt => {
                  const isSelected = subtitleStyle === opt.id
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSubtitleStyle(opt.id)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/30'
                      }`}
                    >
                      <Icon size={16} className={isSelected ? 'text-purple-400' : 'text-gray-400'} />
                      <span className="text-white text-[10px] font-medium">{opt.label}</span>
                      <span className="text-gray-500 text-[9px] leading-tight">{opt.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Duration selection */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-text-primary">⏱ אורך כל סרטון:</h4>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setTargetDuration(option.value)}
                  className={`p-3 rounded-xl border text-center transition ${
                    targetDuration === option.value
                      ? 'border-purple-500 bg-purple-500/15'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="text-white font-medium text-sm">{option.label}</div>
                  <div className="text-gray-500 text-xs">{option.desc}</div>
                </button>
              ))}
            </div>

            {targetDuration === 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">מותאם:</span>
                <input
                  type="number"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="מספר שניות"
                  min={5}
                  max={600}
                  className="w-32 px-3 py-2 bg-white/[0.03] rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/40 transition-colors"
                />
                <span className="text-sm text-text-muted">שניות</span>
              </div>
            )}

            {targetDuration === -1 && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mt-2">
                <p className="text-purple-300 text-sm">
                  🤖 ה-AI ינתח את התוכן ויבחר את האורך האופטימלי לכל סרטון:
                </p>
                <ul className="text-gray-400 text-xs mt-2 space-y-1">
                  <li>• מנתח את קצב הדיבור וצפיפות התוכן</li>
                  <li>• מזהה נקודות פתיחה וסגירה טבעיות</li>
                  <li>• מתאים את האורך לפלטפורמה שנבחרה</li>
                  <li>• מוודא שכל סרטון מספר סיפור שלם</li>
                </ul>
              </div>
            )}
          </div>

          {/* Number of videos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text-primary">כמה סרטונים?</label>
              <span className="text-xs text-text-muted">
                (מקסימום: {maxVideos})
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNumberOfVideos(Math.max(1, numberOfVideos - 1))}
                className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] text-text-secondary hover:bg-white/[0.08] transition-colors flex items-center justify-center text-lg font-bold"
              >
                −
              </button>
              <div className="w-16 h-10 rounded-xl bg-white/[0.06] border border-accent-purple/30 flex items-center justify-center">
                <span className="text-lg font-bold text-accent-purple">{numberOfVideos}</span>
              </div>
              <button
                onClick={() => setNumberOfVideos(Math.min(20, numberOfVideos + 1))}
                className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] text-text-secondary hover:bg-white/[0.08] transition-colors flex items-center justify-center text-lg font-bold"
              >
                +
              </button>
            </div>
            {numberOfVideos > maxVideos && (
              <p className="text-xs text-yellow-400">
                ייתכן שאין מספיק חומר עבור {numberOfVideos} סרטונים. מומלץ עד {maxVideos}.
              </p>
            )}
          </div>

          {/* B-Roll generator */}
          <div className="space-y-2" dir="rtl">
            <h4 className="text-white text-sm font-bold">
              <Film size={14} className="inline ml-1" />
              מודל B-Roll
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {BROLL_MODEL_OPTIONS.map(model => (
                <button
                  key={model.id}
                  onClick={() => setBrollModel(model.id)}
                  className={`p-2 rounded-lg border text-right transition ${
                    brollModel === model.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{model.icon}</span>
                    {model.badge && (
                      <span className="text-[9px] bg-purple-600/60 text-purple-200 px-1.5 py-0.5 rounded-full">{model.badge}</span>
                    )}
                  </div>
                  <div className="text-white text-xs font-medium">{model.label}</div>
                  <div className="text-gray-500 text-[10px]">{model.quality} • {model.speed}</div>
                  <div className="text-green-400 text-xs font-bold">${model.cost.toFixed(2)} / קליפ</div>
                </button>
              ))}
            </div>
          </div>

          {/* Logo upload */}
          <LogoUpload logo={logo} onLogoChange={setLogo} />

          {/* Brand images for B-Roll */}
          <BrandImageUpload />

          {/* Cost estimate */}
          {(() => {
            const estimatedBRollClips = 4
            const selectedModelCost = BROLL_MODEL_OPTIONS.find(m => m.id === brollModel)?.cost || 0.15
            const brollCost = estimatedBRollClips * selectedModelCost
            const gptCost = 0.15
            const transcriptionCost = 0.05
            const backgroundImageCost = selectedOptions.includes('background_image') ? 0.02 : 0
            const totalEstimate = brollCost + gptCost + transcriptionCost + backgroundImageCost
            return (
              <div className="bg-white/5 rounded-lg p-3 border border-white/10" dir="rtl">
                <h4 className="text-white text-sm font-bold mb-2">💰 עלות משוערת</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-400">
                    <span>תמלול (Deepgram)</span>
                    <span>${transcriptionCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>תכנון AI (GPT)</span>
                    <span>${gptCost.toFixed(2)}</span>
                  </div>
                  {selectedOptions.includes('background_image') && (
                    <div className="flex justify-between text-gray-400">
                      <span>תמונת רקע (Gemini)</span>
                      <span>${backgroundImageCost.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-400">
                    <span>B-Roll ({estimatedBRollClips} קליפים × ${selectedModelCost.toFixed(2)})</span>
                    <span>${brollCost.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-white/10 pt-1 flex justify-between text-white font-bold">
                    <span>סה"כ משוער</span>
                    <span>${totalEstimate.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Personalization indicator */}
          {profile.confidenceScore >= 0.3 && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
              <span className="text-purple-400 text-sm">ההגדרות מותאמות אישית לפרופיל העריכה שלך</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4 pb-8">
            <button
              onClick={handleStart}
              disabled={!userPrompt.trim() || selectedFormats.length === 0}
              className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-l from-accent-purple to-purple-600 hover:from-accent-purple/90 hover:to-purple-600/90 rounded-xl text-sm font-bold transition-all shadow-lg shadow-accent-purple/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles size={18} />
              התחל עריכה אוטומטית
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-4 py-3 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowRight size={16} />
              חזרה
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
