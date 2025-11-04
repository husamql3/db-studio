// "use client"

// import { useState, useRef, useEffect } from "react"
// import { Plus, ChevronRight, Search, Pin, PinOff } from "lucide-react"

// const TREE_DATA = {
//   label: "Mythical University",
//   groups: [
//     {
//       title: "Base",
//       items: [
//         { id: "intro", label: "Introduction", href: "#introduction", current: true },
//         { id: "getting-started", label: "Getting Started", href: "#getting-started" },
//         { id: "checklist", label: "The Checklist", href: "#checklist" },
//         { id: "requests", label: "Requests", href: "#requests" },
//       ],
//     },
//     {
//       title: "Modules",
//       items: [
//         {
//           id: "foundations",
//           label: "Foundations",
//           href: "#foundations",
//           items: [
//             { id: "overview", label: "Overview", href: "#overview" },
//             {
//               id: "css-animation",
//               label: "CSS Animation",
//               href: "#css-animation",
//               items: [
//                 { id: "css-animation-anatomy", label: "Anatomy", href: "#css-animation-anatomy" },
//                 { id: "first-keyframe", label: "Keyframes", href: "#keyframes" },
//                 { id: "delays", label: "Delays", href: "#delays" },
//               ],
//             },
//             {
//               id: "svg-filters",
//               label: "SVG Filters",
//               href: "#svg-filters",
//               items: [
//                 { id: "svg-filter-anatomy", label: "Anatomy", href: "#svg-filter-anatomy" },
//                 { id: "goo", label: "Goo", href: "#goo" },
//                 { id: "noise", label: "Noise", href: "#noise" },
//               ],
//             },
//             {
//               id: "canvas",
//               label: "Canvas",
//               href: "#canvas",
//               items: [
//                 { id: "canvas-anatomy", label: "Anatomy", href: "#canvas-anatomy" },
//                 { id: "particles", label: "Particles", href: "#particles" },
//                 { id: "projection", label: "Projection", href: "#projection" },
//               ],
//             },
//           ],
//         },
//         {
//           id: "studio",
//           label: "Studio",
//           href: "#studio",
//           items: [
//             { id: "tri-toggle", label: "Tri-Toggle", href: "#tri-toggle" },
//             {
//               id: "liquid-glass",
//               label: "Liquid Glass",
//               href: "#liquid-glass",
//               items: [
//                 { id: "liquid-displacement", label: "Displacement", href: "#liquid-displacement" },
//                 { id: "liquid-toggle", label: "Toggle", href: "#liquid-toggle" },
//                 { id: "liquid-slider", label: "Slider", href: "#liquid-slider" },
//               ],
//             },
//             { id: "bear-toggle", label: "Bear toggle", href: "#bear-toggle" },
//             { id: "you-can-scroll", label: "You can scroll", href: "#you-can-scroll" },
//             { id: "split-flap-display", label: "3D Split Flap", href: "#split-flap-display" },
//             { id: "signature-flow", label: "Signature flow", href: "#signature-flow" },
//           ],
//         },
//         {
//           id: "horizon",
//           label: "Horizon",
//           href: "#horizon",
//           items: [
//             { id: "scroll-markers", label: ":scroll-marker-group", href: "#scroll-markers" },
//             { id: "css-scroll-animation", label: "Scroll-driven Animation", href: "#css-scroll-animation" },
//             { id: "starting-style", label: "@starting-style", href: "#starting-style" },
//             { id: "details-content", label: "::details-content", href: "#details-content" },
//             { id: "styleable-select", label: "Styleable Select", href: "#styleable-select" },
//             { id: "view-transitions", label: "View Transitions", href: "#view-transitions" },
//             { id: "scroll-target-group", label: "scroll-target-group", href: "#scroll-target-group" },
//             { id: "stuck", label: ":stuck", href: "#stuck" },
//           ],
//         },
//       ],
//     },
//   ],
// }

// const TreeItem = ({ item, level = 1, currentId, onToggle, onSelect, expandedIds, searchTerm }) => {
//   const hasChildren = item.items && item.items.length > 0
//   const isExpanded = expandedIds.has(item.id)
//   const isCurrent = currentId === item.id

//   const handleClick = (e) => {
//     if (!hasChildren) {
//       onSelect(item.id)
//     }
//   }

//   const handleIconClick = (e) => {
//     e.preventDefault()
//     e.stopPropagation()
//     onToggle(item.id)
//   }

//   const matchesSearch = searchTerm.length >= 3 && item.label.toLowerCase().includes(searchTerm.toLowerCase())

//   return (
//     <li className="relative">
//       <a
//         href={item.href || "#"}
//         onClick={handleClick}
//         className={`
//           flex items-center gap-2 px-4 py-1.5 text-sm transition-colors
//           hover:text-zinc-100 focus:outline-none focus:bg-red-500/10 focus:text-zinc-100
//           ${isCurrent ? "text-white" : "text-zinc-400"}
//           ${matchesSearch ? "bg-red-500/60 text-white" : ""}
//         `}
//         style={{ paddingLeft: `${level * 16}px` }}
//       >
//         {isCurrent && <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />}
//         <span className="flex-1">{item.label}</span>
//         {hasChildren && (
//           <button
//             onClick={handleIconClick}
//             className="p-1 hover:bg-zinc-800 rounded transition-colors"
//             aria-label={isExpanded ? "Collapse" : "Expand"}
//           >
//             <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-[135deg]" : ""}`} />
//           </button>
//         )}
//       </a>
//       {hasChildren && isExpanded && (
//         <ul>
//           {item.items.map((child) => (
//             <TreeItem
//               key={child.id}
//               item={child}
//               level={level + 1}
//               currentId={currentId}
//               onToggle={onToggle}
//               onSelect={onSelect}
//               expandedIds={expandedIds}
//               searchTerm={searchTerm}
//             />
//           ))}
//         </ul>
//       )}
//     </li>
//   )
// }

// const App = () => {
//   const [isOpen, setIsOpen] = useState(false)
//   const [isPinned, setIsPinned] = useState(false)
//   const [expandedIds, setExpandedIds] = useState(new Set())
//   const [currentId, setCurrentId] = useState("intro")
//   const [searchTerm, setSearchTerm] = useState("")
//   const searchInputRef = useRef(null)

//   useEffect(() => {
//     const handleKeyPress = (e) => {
//       if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
//         e.preventDefault()
//         searchInputRef.current?.focus()
//       }
//     }

//     document.addEventListener("keydown", handleKeyPress)
//     return () => document.removeEventListener("keydown", handleKeyPress)
//   }, [])

//   const handleSearchChange = (e) => {
//     const value = e.target.value
//     setSearchTerm(value)

//     if (value.length >= 3) {
//       const expandAll = (items) => {
//         items.forEach((item) => {
//           if (item.items) {
//             setExpandedIds((prev) => new Set([...prev, item.id]))
//             expandAll(item.items)
//           }
//         })
//       }

//       TREE_DATA.groups.forEach((group) => expandAll(group.items))
//     }
//   }

//   const handleToggle = (id) => {
//     setExpandedIds((prev) => {
//       const next = new Set(prev)
//       if (next.has(id)) {
//         next.delete(id)
//       } else {
//         next.add(id)
//       }
//       return next
//     })
//   }

//   const handleSelect = (id) => {
//     setCurrentId(id)
//   }

//   return (
//     <div className="bg-zinc-950 h-screen w-full flex relative">
//       <aside
//         className={`
//           fixed left-0 top-0 bg-black border-r border-zinc-800 z-50 h-screen
//           transition-transform duration-300 ease-out
//           ${isOpen || isPinned ? "translate-x-0" : "-translate-x-full"}
//         `}
//         style={{ width: "260px" }}
//       >
//         <div className="flex flex-col h-full">
//           {/* Sidebar Header */}
//           <div className="p-2 space-y-2 border-b border-zinc-800">
//             <div className="flex items-center justify-between">
//               <button
//                 onClick={() => setIsPinned(!isPinned)}
//                 className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
//                 title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
//               >
//                 {isPinned ? <Pin className="w-5 h-5" /> : <PinOff className="w-5 h-5" />}
//               </button>

//               {!isPinned && (
//                 <button
//                   onClick={() => setIsOpen(false)}
//                   className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
//                   title="Close sidebar"
//                 >
//                   <Plus className="w-5 h-5 rotate-45" />
//                 </button>
//               )}
//             </div>

//             <button className="w-full h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm text-zinc-300">
//               New Request
//             </button>

//             <div className="relative">
//               <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
//               <input
//                 ref={searchInputRef}
//                 type="text"
//                 placeholder="Find"
//                 value={searchTerm}
//                 onChange={handleSearchChange}
//                 className="w-full h-8 pl-8 pr-8 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
//               />
//               <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded">
//                 /
//               </kbd>
//             </div>
//           </div>

//           <div className="flex-1 overflow-y-auto">
//             <nav className="py-2">
//               {TREE_DATA.groups.map((group, idx) => (
//                 <div key={idx} className="mb-4">
//                   <div className="px-4 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
//                     {group.title}
//                   </div>
//                   <ul>
//                     {group.items.map((item) => (
//                       <TreeItem
//                         key={item.id}
//                         item={item}
//                         currentId={currentId}
//                         onToggle={handleToggle}
//                         onSelect={handleSelect}
//                         expandedIds={expandedIds}
//                         searchTerm={searchTerm}
//                       />
//                     ))}
//                   </ul>
//                 </div>
//               ))}
//             </nav>
//           </div>
//         </div>
//       </aside>

//       {/* Backdrop */}
//       {isOpen && !isPinned && (
//         <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsOpen(false)} />
//       )}

//       <div className={`flex-1  flex flex-col transition-all duration-300 ease-out ${isPinned ? "ml-[260px]" : ""}`}>
//         <header className="h-8 border-b border-zinc-800 w-full flex items-center bg-black">
//           <button
//             onClick={() => setIsOpen(!isOpen)}
//             className="aspect-square size-8 border-r border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
//           >
//             <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
//               <path d="M3 8.25V18C3 18.5967 3.23705 19.169 3.65901 19.591C4.08097 20.0129 4.65326 20.25 5.25 20.25H18.75C19.3467 20.25 19.919 20.0129 20.341 19.591C20.7629 19.169 21 18.5967 21 18V8.25M3 8.25V6C3 5.40326 3.23705 4.83097 3.65901 4.40901C4.08097 3.98705 4.65326 3.75 5.25 3.75H18.75C19.3467 3.75 19.919 3.98705 20.341 4.40901C20.7629 4.83097 21 5.40326 21 6V8.25M3 8.25H21M5.25 6H5.258V6.008H5.25V6ZM7.5 6H7.508V6.008H7.5V6ZM9.75 6H9.758V6.008H9.75V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
//               <path className="icon-bar" d="M4.75 10H11V18.5H5.75C5.19772 18.5 4.75 18.0523 4.75 17.5V10Z" fill="currentColor" />
//             </svg>
//           </button>
//         </header>

//         <main className="flex-1 p-2">
//           <div className="text-zinc-400">Content area</div>
//         </main>
//       </div>
//     </div>
//   )
// }

// export default App
