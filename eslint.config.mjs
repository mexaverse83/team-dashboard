import coreWebVitals from "eslint-config-next/core-web-vitals";

// toISOString() is UTC: after 18:00 in Mexico City it already says tomorrow,
// and month keys from local midnights land in the previous month (CH-10).
const NO_UTC_DATE_KEYS = {
  selector: "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
  message: "toISOString().slice(...) is a UTC date. Use localDateKey()/monthKey()/mexicoCityToday() from '@/lib/dates'.",
};

// NEXT_PUBLIC_* values are inlined into browser JS; a key or secret there is
// public (perf-17). The anon key and VAPID public key are public by design.
const NO_PUBLIC_SECRETS = {
  selector: "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_(?!SUPABASE_ANON_KEY$|VAPID_PUBLIC_KEY$).*(KEY|SECRET|TOKEN|PASSWORD)/]",
  message: "Never expose keys or secrets as NEXT_PUBLIC_* — browser calls authenticate with the session cookie.",
};

// Files that still carry the UTC pattern; their owners are removing it. Shrink
// this list, never grow it.
const LEGACY_UTC_DATE_FILES = [
  "src/app/api/finance/forecast/route.ts",
  "src/app/api/finance/net-worth/route.ts",
  "src/app/api/finance/process-recurring/route.ts",
  "src/app/api/finance/rules/route.ts",
  "src/app/api/finance/widget-script/route.ts",
  "src/app/api/finance/wolff-events/route.ts",
  "src/components/finance/bills-timeline.tsx",
  "src/components/finance/budget-builder-client.tsx",
  "src/components/finance/debt-client.tsx",
  "src/components/finance/insights-client.tsx",
  "src/components/finance/installments-client.tsx",
  "src/components/finance/subscriptions-client.tsx",
  "src/lib/finance-utils.ts",
  "src/lib/recurring-dates.ts",
  "src/lib/server/summary.ts",
  "src/lib/server/west.ts",
  // dates.ts owns the conversions
  "src/lib/dates.ts",
];

// Scriptable (iOS widget runtime) globals for the widget source (CH-14).
const SCRIPTABLE_GLOBALS = Object.fromEntries([
  "Alert", "args", "Calendar", "CalendarEvent", "CallbackURL", "Color", "config", "Contact", "Data", "DateFormatter",
  "Device", "Dictation", "DocumentPicker", "DrawContext", "FileManager", "Font", "Image", "importModule", "Keychain",
  "LinearGradient", "ListWidget", "Location", "Mail", "Message", "module", "Notification", "Pasteboard", "Path", "Photos",
  "Point", "QuickLook", "Rect", "RecurrenceRule", "RelativeDateTimeFormatter", "Reminder", "Request", "Safari", "Script",
  "SFSymbol", "ShareSheet", "Size", "Speech", "Timer", "UITable", "UITableCell", "UITableRow", "URLScheme", "UUID",
  "WebView", "WidgetDate", "WidgetImage", "WidgetSpacer", "WidgetStack", "WidgetText", "XMLParser", "console",
].map(name => [name, "readonly"]));

const config = [
  ...coreWebVitals,
  {
    ignores: ["node_modules/**", ".next/**", "out/**"],
  },
  {
    // React-Compiler-era strictness (purity, setState-in-effect, ref timing)
    // flags ~20 long-standing patterns across the finance components. Surface
    // them as warnings to fix incrementally rather than blocking the build.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["src/**/*.{ts,tsx,js,mjs}"],
    rules: {
      "no-restricted-syntax": ["error", NO_UTC_DATE_KEYS, NO_PUBLIC_SECRETS],
    },
  },
  {
    files: LEGACY_UTC_DATE_FILES,
    rules: {
      "no-restricted-syntax": ["error", NO_PUBLIC_SECRETS],
    },
  },
  {
    // safe-to-spend still sends NEXT_PUBLIC_FINANCE_API_KEY on a dead path
    // (perf-17); its owner removes the header, then this override goes.
    files: ["src/components/finance/safe-to-spend.tsx"],
    rules: {
      "no-restricted-syntax": ["error", NO_UTC_DATE_KEYS],
    },
  },
  {
    files: ["src/widget/**/*.{js,mjs}"],
    languageOptions: { globals: SCRIPTABLE_GLOBALS },
    rules: { "no-undef": "error" },
  },
  {
    // Test files: anonymous stub components in vi.mock factories are fine.
    files: ["tests/**"],
    rules: {
      "react/display-name": "off",
    },
  },
];

export default config;
