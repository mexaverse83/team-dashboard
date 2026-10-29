import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The design tokens add font sizes (`text-micro`, `text-label`) that
// tailwind-merge would otherwise read as text colours — so `cn('text-label',
// 'text-positive')` silently dropped the size. Register them as font sizes.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "label"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
