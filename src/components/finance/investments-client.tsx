'use client'

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Page, PageHeader } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFinanceData } from '@/hooks/use-finance-data'
import type { FamilyFutureBaby } from '@/components/finance/family-tracker'
import { computePortfolio } from './investments/portfolio'
import { OwnerFilterControl, SourceError } from './investments/shared'
import { TabSkeleton } from './investments/tab-skeleton'
import { useInvestmentsData, useNetWorth } from './investments/use-investments-data'
import { INVESTMENT_TABS, type InvestmentSource, type InvestmentsTab } from './investments/types'

// Each tab's code loads on first open (perf-11): the crypto, WEST and
// retirement modules no longer ship with the Portfolio view.
const PortfolioTab = dynamic(() => import('./investments/portfolio-tab').then(m => m.PortfolioTab), { loading: () => <TabSkeleton /> })
const StocksTab = dynamic(() => import('./investments/stocks-tab').then(m => m.StocksTab), { loading: () => <TabSkeleton /> })
const FixedIncomeTab = dynamic(() => import('./investments/fixed-income-tab').then(m => m.FixedIncomeTab), { loading: () => <TabSkeleton /> })
const RealEstateTab = dynamic(() => import('./investments/real-estate-tab').then(m => m.RealEstateTab), { loading: () => <TabSkeleton /> })
const CryptoClient = dynamic(() => import('./crypto-client').then(m => m.CryptoClient), { loading: () => <TabSkeleton /> })
const RetirementTab = dynamic(() => import('./retirement-client').then(m => m.RetirementTab), { loading: () => <TabSkeleton /> })

const SOURCE_LABEL: Record<InvestmentSource, string> = {
  crypto: 'crypto',
  stocks: 'stocks',
  fixedIncome: 'fixed income',
  realEstate: 'real estate',
  retirement: 'retirement',
}

async function fetchBaby(signal: AbortSignal): Promise<FamilyFutureBaby | null> {
  const res = await fetch('/api/finance/summary', { signal, cache: 'no-store' })
  if (!res.ok) return null
  const json = await res.json()
  return (json?.baby_plan as FamilyFutureBaby | undefined) ?? null
}

export function InvestmentsClient({ initialTab }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState<InvestmentsTab>(
    INVESTMENT_TABS.includes(initialTab as InvestmentsTab) ? (initialTab as InvestmentsTab) : 'Portfolio',
  )
  const [ownerFilter, setOwnerFilter] = useState('All')
  const { data, error, loading, refresh } = useInvestmentsData()
  const netWorth = useNetWorth()
  // baby_plan for the Family future strip, fetched once and only for Portfolio
  const baby = useFinanceData('investments:baby', fetchBaby, { enabled: activeTab === 'Portfolio', refetchOnVisible: false })

  const portfolio = useMemo(() => computePortfolio({
    stocks: data?.stocks ?? [],
    fixedIncome: data?.fixedIncome ?? [],
    realEstate: data?.realEstate ?? [],
    crypto: data?.crypto ?? [],
    prices: data?.prices ?? null,
    retirement: data?.retirement ?? [],
    ownerFilter,
  }), [data, ownerFilter])

  const errors = useMemo(() => data?.errors ?? {}, [data])
  const failedSources = (Object.keys(errors) as InvestmentSource[]).map(k => SOURCE_LABEL[k])

  const selectTab = useCallback((tab: string) => {
    setActiveTab(tab as InvestmentsTab)
    try {
      const url = new URL(window.location.href)
      if (tab === 'Portfolio') url.searchParams.delete('tab')
      else url.searchParams.set('tab', tab)
      window.history.replaceState(window.history.state, '', url)
    } catch { /* non-browser */ }
  }, [])

  const onChanged = useCallback(() => refresh(), [refresh])
  const retry = useCallback(() => { void refresh() }, [refresh])

  return (
    <Page>
      <PageHeader
        title="Investments"
        description="Everything the two of you own, live where we can price it."
        actions={<OwnerFilterControl value={ownerFilter} onChange={setOwnerFilter} />}
      />

      {!loading && !data && error && <SourceError what="your investments" onRetry={retry} />}
      {failedSources.length > 0 && <SourceError what={failedSources.join(', ')} onRetry={retry} />}

      <Tabs value={activeTab} onValueChange={selectTab}>
        <div className="-mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] [scrollbar-width:none] sm:mx-0 sm:px-0 sm:[mask-image:none]">
          <TabsList aria-label="Investment views" className="w-max max-w-none overflow-visible">
            {INVESTMENT_TABS.map(tab => (
              <TabsTrigger key={tab} value={tab} className="relative shrink-0">
                {tab}
                {tabSource(tab) && errors[tabSource(tab)!] && <span aria-label="didn't load" className="h-1.5 w-1.5 rounded-full bg-warning" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="Portfolio">
          {loading ? <TabSkeleton /> : (
            <PortfolioTab portfolio={portfolio} ownerFilter={ownerFilter} errors={errors} netWorth={netWorth.data}
              baby={baby.data} onOpenTab={tab => selectTab(tab)} onRetry={retry} />
          )}
        </TabsContent>
        <TabsContent value="Crypto">
          <CryptoClient ownerFilter={ownerFilter} />
        </TabsContent>
        <TabsContent value="Stocks">
          {loading ? <TabSkeleton /> : <StocksTab portfolio={portfolio} ownerFilter={ownerFilter} failed={!!errors.stocks || !data} onRetry={retry} onChanged={onChanged} />}
        </TabsContent>
        <TabsContent value="Fixed Income">
          {loading ? <TabSkeleton /> : <FixedIncomeTab portfolio={portfolio} ownerFilter={ownerFilter} failed={!!errors.fixedIncome || !data} onRetry={retry} onChanged={onChanged} />}
        </TabsContent>
        <TabsContent value="Real Estate">
          {loading ? <TabSkeleton /> : <RealEstateTab portfolio={portfolio} ownerFilter={ownerFilter} failed={!!errors.realEstate || !data} onRetry={retry} onChanged={onChanged} />}
        </TabsContent>
        <TabsContent value="Retirement">
          <RetirementTab ownerFilter={ownerFilter} />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

function tabSource(tab: InvestmentsTab): InvestmentSource | null {
  switch (tab) {
    case 'Crypto': return 'crypto'
    case 'Stocks': return 'stocks'
    case 'Fixed Income': return 'fixedIncome'
    case 'Real Estate': return 'realEstate'
    case 'Retirement': return 'retirement'
    default: return null
  }
}
