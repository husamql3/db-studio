"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Pin, PinOff } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { getTables } from "./services/get-tables"
import { getSearchParam, setSearchParam, deleteSearchParam } from "./utils/search-params"

const TreeItem = ({ item, selectedIds, onSelect }: {
  item: { id: string; label: string }
  selectedIds: Set<string>
  onSelect: (id: string) => void
}) => {
  const isSelected = selectedIds.has(item.id)

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    onSelect(item.id)
  }

  return (
    <li className="relative">
      <a
        href="#"
        onClick={handleClick}
        className={`
          flex items-center gap-2 px-4 py-1.5 text-sm transition-colors
          hover:text-zinc-100 focus:outline-none focus:bg-red-500/10 focus:text-zinc-100
          ${isSelected ? "text-white" : "text-zinc-400"}
        `}
      >
        {isSelected && <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />}
        <span className="flex-1">{item.label}</span>
      </a>
    </li>
  )
}

const App = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set())

  const { data: tables, isLoading, error } = useQuery({
    queryKey: ['tables'],
    queryFn: getTables,
  })

  // Initialize selected tables from URL on mount
  useEffect(() => {
    const tablesParam = getSearchParam('tables')
    if (tablesParam) {
      const tableIds = tablesParam.split(',').filter(Boolean)
      setSelectedTableIds(new Set(tableIds))
    }
  }, [])

  const handleSelect = (id: string) => {
    setSelectedTableIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        // Deselect if already selected
        next.delete(id)
      } else {
        // Select if not selected
        next.add(id)
      }
      
      // Update URL query params
      if (next.size > 0) {
        setSearchParam('tables', Array.from(next).join(','))
      } else {
        // Remove param if no tables selected
        deleteSearchParam('tables')
      }
      
      return next
    })
  }

  return (
    <div className="bg-zinc-950 h-screen w-full flex relative">
      <aside
        className={`
          fixed left-0 top-0 bg-black border-r border-zinc-800 z-50 h-screen
          transition-transform duration-300 ease-out w-[260px]
          ${isOpen || isPinned ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-2 space-y-2 border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsPinned(!isPinned)}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
                title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
              >
                {isPinned ? <Pin className="w-5 h-5" /> : <PinOff className="w-5 h-5" />}
              </button>

              {!isPinned && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
                  title="Close sidebar"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              )}
            </div>

            <button className="w-full h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm text-zinc-300">
              New Request
            </button>

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Find"
                className="w-full h-8 pl-8 pr-8 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded">
                /
              </kbd>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <nav className="py-2">
              {isLoading && (
                <div className="text-zinc-500 text-sm px-4">Loading tables...</div>
              )}
              {error && (
                <div className="text-red-500 text-sm px-4">Failed to load tables</div>
              )}
              {tables && tables.length === 0 && (
                <div className="text-zinc-500 text-sm px-4">No tables found</div>
              )}
              {tables && tables.length > 0 && (
                <ul>
                  {tables.map((table) => (
                    <TreeItem
                      key={table}
                      item={{ id: table, label: table }}
                      selectedIds={selectedTableIds}
                      onSelect={handleSelect}
                    />
                  ))}
                </ul>
              )}
            </nav>
          </div>
        </div>
      </aside>

      {/* Backdrop */}
      {isOpen && !isPinned && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsOpen(false)} />
      )}

      <div className={`flex-1  flex flex-col transition-all duration-300 ease-out ${isPinned ? "ml-[260px]" : ""}`}>
        <header className="h-8 border-b border-zinc-800 w-full flex items-center bg-black">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="aspect-square size-8 border-r border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
              <path d="M3 8.25V18C3 18.5967 3.23705 19.169 3.65901 19.591C4.08097 20.0129 4.65326 20.25 5.25 20.25H18.75C19.3467 20.25 19.919 20.0129 20.341 19.591C20.7629 19.169 21 18.5967 21 18V8.25M3 8.25V6C3 5.40326 3.23705 4.83097 3.65901 4.40901C4.08097 3.98705 4.65326 3.75 5.25 3.75H18.75C19.3467 3.75 19.919 3.98705 20.341 4.40901C20.7629 4.83097 21 5.40326 21 6V8.25M3 8.25H21M5.25 6H5.258V6.008H5.25V6ZM7.5 6H7.508V6.008H7.5V6ZM9.75 6H9.758V6.008H9.75V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path className="icon-bar" d="M4.75 10H11V18.5H5.75C5.19772 18.5 4.75 18.0523 4.75 17.5V10Z" fill="currentColor" />
            </svg>
          </button>
        </header>

        <main className="flex-1 p-2">
          <div className="text-zinc-400">Content area</div>
        </main>
      </div>
    </div>
  )
}

export default App