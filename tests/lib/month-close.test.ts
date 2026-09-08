// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE finance_transactions (type text, amount_mxn numeric, transaction_date date, owner text);
    CREATE TABLE finance_goals (id integer PRIMARY KEY, owner text, goal_type text DEFAULT 'savings', is_completed boolean DEFAULT false,
      monthly_contribution numeric DEFAULT 0, current_amount numeric DEFAULT 0, target_amount numeric DEFAULT 10000,
      last_contribution_date date, last_contribution_amount numeric, updated_at timestamptz);
    CREATE TABLE finance_monthly_savings (month date, owner text, gross_income numeric, total_expenses numeric,
      planned_contribution numeric, UNIQUE(month, owner));
  `)
  await db.exec(readFileSync('supabase-finance-atomic-month-close.sql', 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('TRUNCATE finance_transactions, finance_goals, finance_monthly_savings') })
const close = () => db.query("SELECT finance_close_month('2020-01-01')")
const balances = async () => (await db.query<{ current_amount: string }>('SELECT current_amount FROM finance_goals ORDER BY id')).rows.map(r => Number(r.current_amount))

describe('atomic month close (real PostgreSQL engine)', () => {
  it('allocates the surplus once across goals, respects owners and excludes next month', async () => {
    await db.exec(`INSERT INTO finance_goals(id, owner, monthly_contribution) VALUES (1,'Bernardo',300),(2,'bernardo',100),(3,'Laura',100);
      INSERT INTO finance_transactions VALUES ('income',1000,'2020-01-10','Bernardo'),('expense',200,'2020-01-11','bernardo'),('income',9999,'2020-02-01','Bernardo');`)
    await close()
    expect(await balances()).toEqual([600, 200, 0])
    await close()
    expect(await balances()).toEqual([600, 200, 0])
    expect((await db.query('SELECT * FROM finance_monthly_savings')).rows).toHaveLength(3)
  })
  it('caps completed goals and preserves the original planned total', async () => {
    await db.exec(`INSERT INTO finance_goals(id,owner,monthly_contribution,target_amount) VALUES (1,'Bernardo',100,50);
      INSERT INTO finance_transactions VALUES ('income',100,'2020-01-10','Bernardo');`)
    await close()
    expect(await balances()).toEqual([50])
    expect((await db.query<{ planned_contribution: string }>("SELECT planned_contribution FROM finance_monthly_savings WHERE owner='total'")).rows[0].planned_contribution).toBe('100')
  })
  it('reports deficits without inventing withdrawals from existing savings', async () => {
    await db.exec(`INSERT INTO finance_goals(id,owner,monthly_contribution,current_amount) VALUES (1,'Bernardo',100,500);
      INSERT INTO finance_transactions VALUES ('expense',100,'2020-01-10','Bernardo');`)
    await close()
    expect(await balances()).toEqual([500])
  })
  it('rolls snapshots and credits back together on a goal write failure', async () => {
    await db.exec(`INSERT INTO finance_goals(id,owner,monthly_contribution) VALUES (1,'Bernardo',100);
      INSERT INTO finance_transactions VALUES ('income',100,'2020-01-10','Bernardo');
      ALTER TABLE finance_goals ADD CONSTRAINT simulated_failure CHECK (current_amount = 0);`)
    await expect(close()).rejects.toThrow()
    expect((await db.query('SELECT * FROM finance_monthly_savings')).rows).toHaveLength(0)
    await db.exec('ALTER TABLE finance_goals DROP CONSTRAINT simulated_failure')
    await close()
    expect(await balances()).toEqual([100])
  })
  it('does not re-credit an existing owner snapshot after an old partial run', async () => {
    await db.exec(`INSERT INTO finance_goals(id,owner,monthly_contribution,current_amount) VALUES (1,'Bernardo',100,500);
      INSERT INTO finance_transactions VALUES ('income',100,'2020-01-10','Bernardo');
      INSERT INTO finance_monthly_savings VALUES ('2020-01-01','bernardo',100,0,100);`)
    await close()
    expect(await balances()).toEqual([500])
    expect((await db.query('SELECT * FROM finance_monthly_savings')).rows).toHaveLength(3)
  })
  it('never allocates more than available, even with fractional shares', async () => {
    await db.exec(`INSERT INTO finance_goals(id,owner,monthly_contribution) VALUES (1,'Bernardo',1),(2,'Bernardo',1),(3,'Bernardo',1);
      INSERT INTO finance_transactions VALUES ('income',1,'2020-01-10','Bernardo');`)
    await close()
    expect(await balances()).toEqual([0.33, 0.33, 0.33])
  })
  it('rejects open months, invalid boundaries and browser roles', async () => {
    await expect(db.query("SELECT finance_close_month('2099-01-01')")).rejects.toThrow()
    await expect(db.query("SELECT finance_close_month('2020-01-02')")).rejects.toThrow()
    await db.exec('SET ROLE anon')
    await expect(close()).rejects.toThrow('permission denied')
    await db.exec('RESET ROLE')
  })
})
