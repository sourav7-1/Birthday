// The single place to edit the birthday — date, names and every word on screen.
// See docs/ARCHITECTURE.md → "Setting the date".
//
// target.local is a wall-clock time, "YYYY-MM-DDTHH:mm" (seconds optional).
// Give EITHER timeZone (IANA name, DST-aware) OR utcOffset ("+06:00").
// Bangladesh: timeZone 'Asia/Dhaka' (UTC+06:00, no DST) — same as utcOffset '+06:00'.

export type AfterTarget = 'gate' | 'celebrate' | 'message'

export interface BirthdayConfig {
  name: string
  target: { local: string; timeZone?: string; utcOffset?: string }
  intro: { title: string; subtitle: string; ready: string }
  /** Small line above the name while the cake is revealed. */
  cakeTitle: string
  /** Piped onto the top of the cake, exactly as written (wrapped onto two lines automatically). */
  cakeMessage: string
  cutPrompt: string
  /** Shown (as a button) once the cut slice can be picked up. */
  slicePrompt: string
  /** Caption while the slice is "eaten". */
  eatingCaption: string
  /** Final message, one entry per line revealed. Leave signature empty to omit it. */
  message: { heading: string; lines: string[]; signature: string }
  wishPrompt: string
  showCountdown: boolean
  /** Enter the experience on its own the moment the countdown hits zero. */
  autoStart: boolean
  /** What a visitor sees when they open the page after the target time. */
  afterTarget: AfterTarget
  /** `?preview=<scene>` is honoured only when this is true. Never touches the countdown. */
  allowPreview: boolean
  /** Put the file in /public, e.g. '/music.mp3'. Leave undefined for no music. */
  music?: { src: string; volume: number }
  mic: {
    /** RMS (0..1) a blow must exceed. Visitors can adjust this with the sensitivity slider. */
    threshold: number
    /** How long the signal must stay above threshold. */
    sustainMs: number
    cooldownMs: number
  }
}

export const birthday: BirthdayConfig = {
  name: 'Eshu',
  target: { local: '2026-10-12T00:00', timeZone: 'Asia/Dhaka' },
  intro: {
    title: 'সুন্দর কিছু একটা আসছে',
    subtitle: 'শুধু তোমার জন্য সাজানো ছোট্ট একটি আয়োজন',
    ready: 'সেই মুহূর্তটি এসে গেছে',
  },
  cakeTitle: 'শুভ জন্মদিন',
  // Stays in English, exactly as written.
  cakeMessage: 'Happy Birthday to My Love Eshu',
  cutPrompt: 'চলো, কেক কাটি',
  slicePrompt: 'কেকের টুকরোটিতে স্পর্শ করো',
  eatingCaption: 'এক টুকরো ভালোবাসা ❤️',
  message: {
    heading: 'Happy Birthday\nMy Love My Baby',
    lines: [
      'Madam ji',
      'তোমার জন্মদিনে আমার প্রথম উইশ',
      'আমি চাই তুমি ভালো থাকো হাসি খুশি থাকো আর আমার হয়ে থাকো',
    ],
    signature: 'Love you Eshika 💝',
  },
  wishPrompt: '',
  showCountdown: true,
  autoStart: true,
  afterTarget: 'gate',
  allowPreview: import.meta.env.DEV,
  music: undefined,
  mic: { threshold: 0.12, sustainMs: 450, cooldownMs: 2500 },
}

/** Interface labels. `{name}` and `{d}` `{h}` `{m}` `{s}` are filled in at runtime. */
export const ui = {
  forName: '{name}-এর জন্য',
  units: { days: 'দিন', hours: 'ঘণ্টা', minutes: 'মিনিট', seconds: 'সেকেন্ড' },
  timeLeft: '{d} দিন, {h} ঘণ্টা, {m} মিনিট ও {s} সেকেন্ড বাকি',
  enter: 'শুরু করো',
  blow: 'মোমবাতিগুলো নিভিয়ে দাও',
  micStart: 'মাইক্রোফোন ব্যবহার করো',
  micStop: 'মাইক্রোফোন বন্ধ করো',
  sensitivity: 'সংবেদনশীলতা',
  sensitivityHint: 'মোমবাতি নিজে থেকেই নিভে গেলে কমাও; ফুঁ ধরা না পড়লে বাড়াও।',
  micPrivacy: 'শব্দ শুধু এই ডিভাইসেই বিশ্লেষণ করা হয় — কিছুই রেকর্ড বা কোথাও পাঠানো হয় না।',
  mic: {
    off: 'মাইক্রোফোন বন্ধ আছে।',
    requesting: 'মাইক্রোফোনের অনুমতির অপেক্ষায়…',
    listening: 'শুনছি। মাইক্রোফোনের দিকে আলতো করে ফুঁ দাও।',
    denied: 'মাইক্রোফোনের অনুমতি দেওয়া হয়নি। “মোমবাতিগুলো নিভিয়ে দাও” বোতামটিও একই কাজ করবে।',
    'no-device': 'কোনো মাইক্রোফোন পাওয়া যায়নি। “মোমবাতিগুলো নিভিয়ে দাও” বোতামটিও একই কাজ করবে।',
    unsupported: 'এই ব্রাউজার বা পেজে (https প্রয়োজন) মাইক্রোফোন ব্যবহার করা যাচ্ছে না। “মোমবাতিগুলো নিভিয়ে দাও” বোতামটি ব্যবহার করো।',
    error: 'মাইক্রোফোন চালু করা গেল না। “মোমবাতিগুলো নিভিয়ে দাও” বোতামটি ব্যবহার করো।',
  },
  cut: 'কেক কাটো',
  replay: 'আবার দেখো',
  recut: 'আবার কেক কাটো',
  soundOn: 'শব্দ চালু আছে',
  soundEnable: 'শব্দ চালু করো',
  pause: 'বিরতি',
  resume: 'চালিয়ে যাও',
  loading: 'লোড হচ্ছে…',
  noWebgl: 'এই ডিভাইসে 3D দেখানো যাচ্ছে না, তাই সহজ সংস্করণটি দেখছ।',
  preview: 'প্রিভিউ',
  exitPreview: 'বের হও',
  status: {
    intro: 'উৎসব শুরু হচ্ছে।',
    blowing: 'মোমবাতিগুলো নিভে যাচ্ছে। তোমার ইচ্ছা পূরণ হোক।',
    cutReady: 'কেক কাটার জন্য সব প্রস্তুত।',
    cutting: 'কেক কাটা হচ্ছে।',
    sliceReady: 'কেকের টুকরোটি তৈরি। স্পর্শ করো।',
    pickup: 'কেকের টুকরোটি তুলে আনা হচ্ছে।',
    firstBite: 'প্রথম কামড়।',
    secondBite: 'দ্বিতীয় কামড়।',
    message: 'শুভ জন্মদিন।',
  } as Record<string, string>,
  diagnostic: {
    eyebrow: 'কনফিগারেশন ঠিক করতে হবে',
    title: 'জন্মদিনের সেটিংস পড়া যায়নি',
    fix: 'src/config/birthday.ts ফাইলটি ঠিক করো। উদাহরণ:',
  },
}

export const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`))
