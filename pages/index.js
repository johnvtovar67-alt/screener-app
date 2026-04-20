import { useEffect, useMemo, useState } from 'react'

const BASE_STOCKS = [
  { ticker: 'GCT', name: 'GigaCloud' },
  { ticker: 'ASO', name: 'Academy Sports' },
  { ticker: 'CROX', name: 'Crocs' },
  { ticker: 'FIX', name: 'Comfort Systems' },
  { ticker: 'VIST', name: 'Vista Energy' },
  { ticker: 'MSTR', name: 'Strategy' },
]

export default function Home() {
  const [query, setQuery] = useState('')
  const [quotes, setQuotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [sortBy, setSortBy] = useState('ticker')
  const [sortDir, setSortDir] = useState('asc')

  async function loadQuotes(isBackground = false) {
    try {
      if (isBackground) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      const res = await fetch('/api/live', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to load quotes')
      }

      const data = await res.json()
      setQuotes(data.quotes || {})
      setLastUpdated(new Date())
    } catch (err) {
      console.error(err)
      setError('Could not load market data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadQuotes()

    const interval = setInterval(() => {
      loadQuotes(true)
    }, 15000) // refresh every 15 sec

    return () => clearInterval(interval)
  }, [])

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const filteredStocks = useMemo(() => {
    const q = query.trim().toLowerCase()

    let rows = BASE_STOCKS.map((stock) => {
      const live = quotes[stock.ticker] || {}
      return {
        ...stock,
        price: live.price ?? null,
      }
    })

    if (q) {
      rows = rows.filter(
        (row) =>
          row.ticker.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q)
      )
    }

    rows.sort((a, b) => {
      let aVal = a[sortBy]
      let bVal = b[sortBy]

      if (sortBy === 'price') {
        aVal = aVal ?? -1
        bVal = bVal ?? -1
      }

      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return rows
  }, [query, quotes, sortBy, sortDir])

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>🧠 Auto Quant Screener</h1>

        <div style={styles.topBar}>
          <input
            type="text"
            placeholder="Search ticker or company..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.search}
          />

          <button onClick={() => loadQuotes()} style={styles.button}>
            Refresh
          </button>
        </div>

        <div style={styles.statusRow}>
          <span>
            {loading
              ? 'Loading quotes...'
              : refreshing
              ? 'Refreshing...'
              : 'Live data refreshing every 15 seconds'}
          </span>

          <span>
            {lastUpdated
              ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
              : ''}
          </span>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => toggleSort('ticker')}>
                  Ticker {sortBy === 'ticker' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={styles.th} onClick={() => toggleSort('name')}>
                  Name {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={styles.thRight} onClick={() => toggleSort('price')}>
                  Price {sortBy === 'price' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map((stock) => (
                <tr key={stock.ticker} style={styles.row}>
                  <td style={styles.td}>{stock.ticker}</td>
                  <td style={styles.td}>{stock.name}</td>
                  <td style={styles.tdRight}>
                    {stock.price != null ? `$${Number(stock.price).toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}

              {!loading && filteredStocks.length === 0 && (
                <tr>
                  <td colSpan="3" style={styles.empty}>
                    No matches found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f7f7f7',
    padding: '24px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  title: {
    fontSize: '48px',
    fontWeight: 800,
    marginBottom: '24px',
    color: '#111',
  },
  topBar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  search: {
    flex: 1,
    minWidth: '260px',
    padding: '14px 16px',
    fontSize: '18px',
    borderRadius: '10px',
    border: '1px solid #ccc',
    background: '#fff',
  },
  button: {
    padding: '14px 18px',
    fontSize: '16px',
    fontWeight: 600,
    borderRadius: '10px',
    border: '1px solid #ccc',
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '16px',
    fontSize: '14px',
    color: '#555',
  },
  error: {
    marginBottom: '16px',
    padding: '12px 14px',
    borderRadius: '10px',
    background: '#ffe5e5',
    color: '#a40000',
    fontWeight: 600,
  },
  tableWrap: {
    background: '#fff',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid #e5e5e5',
    boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '16px',
    fontSize: '15px',
    fontWeight: 700,
    borderBottom: '1px solid #eee',
    background: '#fafafa',
    cursor: 'pointer',
  },
  thRight: {
    textAlign: 'right',
    padding: '16px',
    fontSize: '15px',
    fontWeight: 700,
    borderBottom: '1px solid #eee',
    background: '#fafafa',
    cursor: 'pointer',
  },
  row: {
    borderBottom: '1px solid #f1f1f1',
  },
  td: {
    padding: '16px',
    fontSize: '16px',
    color: '#111',
  },
  tdRight: {
    padding: '16px',
    fontSize: '16px',
    color: '#111',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: '#777',
  },
}
