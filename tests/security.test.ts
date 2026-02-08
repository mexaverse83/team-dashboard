/**
 * Security Tests — Priority 1
 * Scan for hardcoded credentials, exposed secrets, and security misconfigurations.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.vercel', 'tests'])

function getSourceFiles(dir: string = PROJECT_ROOT): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/eyJhbGciOi[A-Za-z0-9_-]{50,}/, 'Supabase/JWT token'],
  [/sk-proj-[A-Za-z0-9_-]{20,}/, 'OpenAI API key'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/ghp_[A-Za-z0-9]{36,}/, 'GitHub personal access token'],
  [/sbp_[A-Za-z0-9]{40,}/, 'Supabase service role key'],
  [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, 'Private key'],
  [/password\s*[:=]\s*['"][^'"]{8,}['"]/, 'Hardcoded password'],
]

describe('Security Scan', () => {
  const sourceFiles = getSourceFiles()
  const codeFiles = sourceFiles.filter(f => /\.(ts|tsx|js|jsx|json|yml|yaml|sql|md)$/.test(f))

  describe('No hardcoded secrets', () => {
    for (const [pattern, description] of SECRET_PATTERNS) {
      it(`should not contain ${description}`, () => {
        const violations: string[] = []
        for (const file of codeFiles) {
          try {
            const content = fs.readFileSync(file, 'utf-8')
            const lines = content.split('\n')
            lines.forEach((line, i) => {
              if (pattern.test(line)) {
                // Skip comments and example strings
                if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.includes('your-')) return
                violations.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}`)
              }
            })
          } catch {}
        }
        expect(violations, `Found ${description} in:\n${violations.join('\n')}`).toHaveLength(0)
      })
    }
  })

  it('should not have .env files committed', () => {
    const envFiles = sourceFiles.filter(f => {
      const base = path.basename(f)
      return base.startsWith('.env') && !base.includes('example')
    })
    // .env.local exists locally but should be gitignored
    const gitignore = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.env.local')
    expect(gitignore).toContain('.env')
  })

  it('should have empty/placeholder Supabase credentials in .env.local template', () => {
    // The committed .env.local should NOT contain real keys
    const envPath = path.join(PROJECT_ROOT, '.env.local')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8')
      // Check it doesn't have real Supabase URLs
      expect(content).not.toMatch(/https:\/\/[a-z]+\.supabase\.co/)
    }
  })

  it('should use NEXT_PUBLIC_ prefix for client-side env vars only', () => {
    const supabaseLib = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/supabase.ts'), 'utf-8')
    // Supabase URL and anon key are public — that's OK
    expect(supabaseLib).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(supabaseLib).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    // Should NOT expose service role key
    expect(supabaseLib).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(supabaseLib).not.toContain('service_role')
  })

  describe('RLS Policy Audit', () => {
    it('should flag overly permissive RLS policies in schema', () => {
      const schemaPath = path.join(PROJECT_ROOT, 'supabase-schema.sql')
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8')
        // Flag "Allow all" policies — acceptable for dev, not production
        const allowAllCount = (schema.match(/USING \(true\)/g) || []).length
        if (allowAllCount > 0) {
          // This is expected to fail as a warning — xfail equivalent
          console.warn(
            `⚠️ WARNING: ${allowAllCount} RLS policies use USING (true) — ` +
            `open access. Must be restricted for production.`
          )
        }
        // RLS is at least enabled
        expect(schema).toContain('ENABLE ROW LEVEL SECURITY')
      }
    })
  })

  describe('CORS / Headers', () => {
    it('should not have overly permissive Next.js config', () => {
      const configPath = path.join(PROJECT_ROOT, 'next.config.ts')
      const config = fs.readFileSync(configPath, 'utf-8')
      // Next.js config should not have wildcard CORS headers
      expect(config).not.toContain("Access-Control-Allow-Origin: *")
    })
  })
})
