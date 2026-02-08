/**
 * Schema Validation Tests
 * Verify the Supabase schema SQL is well-formed and complete.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase-schema.sql'), 'utf-8')

describe('Supabase Schema', () => {
  describe('Tables', () => {
    const requiredTables = ['agents', 'tickets', 'comments', 'messages', 'agent_metrics']

    for (const table of requiredTables) {
      it(`should create ${table} table`, () => {
        expect(schema).toContain(`CREATE TABLE ${table}`)
      })

      it(`should enable RLS on ${table}`, () => {
        expect(schema).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      })

      it(`should add ${table} to realtime publication`, () => {
        expect(schema).toContain(`ADD TABLE ${table}`)
      })
    }
  })

  describe('Agents table', () => {
    it('should have status CHECK constraint', () => {
      expect(schema).toMatch(/status.*CHECK.*\(status IN \('online', 'offline', 'busy'\)\)/)
    })

    it('should insert 5 initial agents', () => {
      for (const agent of ['tars', 'cooper', 'murph', 'brand', 'mann']) {
        expect(schema).toContain(`'${agent}'`)
      }
    })
  })

  describe('Tickets table', () => {
    it('should have status CHECK constraint', () => {
      expect(schema).toMatch(/status.*CHECK.*backlog.*todo.*in-progress.*review.*done/)
    })

    it('should have priority CHECK constraint', () => {
      expect(schema).toMatch(/priority.*CHECK.*critical.*high.*medium.*low/)
    })

    it('should reference agents table', () => {
      expect(schema).toContain('REFERENCES agents(id)')
    })
  })

  describe('Messages table', () => {
    it('should have message_type CHECK constraint', () => {
      expect(schema).toMatch(/message_type.*CHECK.*chat.*broadcast.*system/)
    })
  })

  describe('Comments table', () => {
    it('should cascade delete with tickets', () => {
      expect(schema).toContain('ON DELETE CASCADE')
    })
  })

  describe('Triggers', () => {
    it('should have update_updated_at function', () => {
      expect(schema).toContain('CREATE OR REPLACE FUNCTION update_updated_at()')
    })

    it('should have trigger on agents', () => {
      expect(schema).toContain('CREATE TRIGGER agents_updated_at')
    })

    it('should have trigger on tickets', () => {
      expect(schema).toContain('CREATE TRIGGER tickets_updated_at')
    })
  })

  describe('Data Integrity', () => {
    it('should insert initial tickets', () => {
      // Count INSERT INTO tickets
      const matches = schema.match(/INSERT INTO tickets/g)
      expect(matches).not.toBeNull()
    })

    it('should insert initial messages', () => {
      const matches = schema.match(/INSERT INTO messages/g)
      expect(matches).not.toBeNull()
    })

    it('should insert initial metrics', () => {
      const matches = schema.match(/INSERT INTO agent_metrics/g)
      expect(matches).not.toBeNull()
    })
  })
})
