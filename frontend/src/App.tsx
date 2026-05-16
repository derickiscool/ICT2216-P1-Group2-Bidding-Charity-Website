import { useState } from 'react'

interface DbTestResult {
  success: boolean
  message: string
  latency?: number
}

function App() {
  const [dbStatus, setDbStatus] = useState<DbTestResult | null>(null)
  const [loading, setLoading] = useState(false)

  const testDatabase = async () => {
    setLoading(true)
    try {
      const response = await fetch('http://localhost:5000/api/db-test')
      const data = await response.json()
      setDbStatus(data)
    } catch (error) {
      setDbStatus({
        success: false,
        message: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-base-100">
      <div className="hero bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-5xl font-bold">BidForGood</h1>
            <p className="py-6">
              A charity auction platform where you can bid on donated items,
              services, or experiences to support verified charity organisations.
            </p>
            <button className="btn btn-primary">Get Started</button>
            
            <div className="mt-8">
              <button 
                className="btn btn-secondary" 
                onClick={testDatabase}
                disabled={loading}
              >
                {loading ? 'Testing...' : 'Test Database Connection'}
              </button>
              
              {dbStatus && (
                <div className={`mt-4 p-4 rounded ${dbStatus.success ? 'bg-success text-success-content' : 'bg-error text-error-content'}`}>
                  <p className="font-bold">{dbStatus.message}</p>
                  {dbStatus.latency && <p>Latency: {dbStatus.latency}ms</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App