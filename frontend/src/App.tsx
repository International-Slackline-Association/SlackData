import './index.css'

export default function App() {
  return (
    <div className="min-h-screen" style={{ background: '#F8F7F4' }}>
      <header data-cy="top-nav" className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
          <span data-cy="wordmark" className="font-bold text-gray-900 text-lg">
            SlackData
          </span>
          <nav data-cy="gear-tabs" className="flex gap-1" />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-12">
        <p className="text-gray-400 text-sm">Coming soon</p>
      </main>
    </div>
  )
}
