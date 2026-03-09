import { Users } from 'lucide-react'

export default function Avatars() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">אווטארים AI</h1>
        <p className="text-text-muted text-sm">צור סרטונים עם דוברים וירטואליים מציאותיים</p>
      </div>

      <div className="bg-bg-card rounded-2xl border border-white/[0.06] p-16 text-center space-y-4">
        <Users size={64} className="mx-auto text-text-muted opacity-30" />
        <h2 className="text-lg font-medium text-text-primary">אווטארים יהיו זמינים בקרוב</h2>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          אנחנו עובדים על הבאת אווטארים AI מתקדמים שיכולים לדבר בעברית ובשפות נוספות.
          הישאר מעודכן!
        </p>
      </div>
    </div>
  )
}
