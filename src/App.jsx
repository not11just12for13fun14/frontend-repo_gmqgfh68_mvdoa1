import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, SlidersHorizontal, SortAsc, Image as ImageIcon, Sun, Moon, Info, FolderOpen, Maximize2, Minimize2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import Spline from '@splinetool/react-spline'
import { FixedSizeGrid as Grid } from 'react-window'
import exifr from 'exifr'
import './index.css'

const SUPPORTED_IMAGE_EXTS = ['jpg','jpeg','png','webp','gif']
const SUPPORTED_VIDEO_EXTS = ['mp4','webm']

function useDarkMode() {
  const [dark, setDark] = useState(() => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const root = document.documentElement
    if (dark) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [dark])
  return { dark, setDark }
}

function bytesToSize(bytes) {
  if (bytes === 0 || bytes == null) return '—'
  const sizes = ['B','KB','MB','GB','TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed( i===0 ? 0 : 2)} ${sizes[i]}`
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString()
}

function Toolbar({ query, setQuery, sortKey, setSortKey, thumbSize, setThumbSize, count, onPickFolder, dark, setDark }) {
  return (
    <div className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-slate-900/70 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
        <button onClick={onPickFolder} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition">
          <FolderOpen className="w-4 h-4" /> Select Folder
        </button>
        <div className="flex-1"></div>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search filename or tags…" className="w-full pl-9 pr-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 dark:text-slate-300">Size</label>
          <input type="range" min="80" max="260" value={thumbSize} onChange={e=>setThumbSize(Number(e.target.value))} />
        </div>
        <div className="relative">
          <select value={sortKey} onChange={e=>setSortKey(e.target.value)} className="px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
            <option value="name">Sort: Name</option>
            <option value="size">Sort: Size</option>
            <option value="created">Sort: Created</option>
            <option value="modified">Sort: Modified</option>
          </select>
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">{count} items</div>
        <button onClick={()=>setDark(!dark)} className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          {dark ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
        </button>
      </div>
    </div>
  )
}

async function* walkDir(dirHandle) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') yield entry
    else if (entry.kind === 'directory') yield* walkDir(entry)
  }
}

async function readMeta(fileHandle) {
  try {
    const file = await fileHandle.getFile()
    const { size, lastModified, name, type } = file
    let created = file.lastModified
    let resolution = null
    let exif = null
    if (type.startsWith('image/')) {
      try {
        const buf = await file.arrayBuffer()
        exif = await exifr.parse(buf).catch(()=>null)
        if (exif && exif.CreateDate) created = new Date(exif.CreateDate).getTime()
        if (exif && exif.ExifImageWidth && exif.ExifImageHeight) {
          resolution = `${exif.ExifImageWidth}×${exif.ExifImageHeight}`
        }
      } catch {}
    }
    return { file, size, lastModified, created, name, type, resolution, exif }
  } catch (e) {
    console.error('meta error', e)
    return null
  }
}

function useFolder() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const pickFolder = async () => {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API. Please use Chrome or Edge.')
      return
    }
    setLoading(true)
    try {
      const dir = await window.showDirectoryPicker()
      const out = []
      for await (const entry of walkDir(dir)) {
        const ext = entry.name.split('.').pop().toLowerCase()
        const isImg = SUPPORTED_IMAGE_EXTS.includes(ext)
        const isVid = SUPPORTED_VIDEO_EXTS.includes(ext)
        if (!isImg && !isVid) continue
        const meta = await readMeta(entry)
        if (!meta) continue
        out.push({ ...meta, handle: entry, ext, isImg, isVid })
      }
      setItems(out)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }
  return { items, setItems, loading, pickFolder }
}

function useFilteredSorted(items, query, sortKey) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(it => {
      const name = it.name.toLowerCase()
      const tags = (it.exif?.XPKeywords || it.exif?.Keywords || '').toString().toLowerCase()
      return name.includes(q) || tags.includes(q)
    })
  }, [items, query])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const compare = {
      name: (a,b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      size: (a,b) => (a.size||0) - (b.size||0),
      created: (a,b) => (a.created||0) - (b.created||0),
      modified: (a,b) => (a.lastModified||0) - (b.lastModified||0),
    }[sortKey]
    arr.sort(compare)
    return arr
  }, [filtered, sortKey])

  return sorted
}

function Thumb({ data, columnIndex, rowIndex, style }) {
  const { items, columnCount, thumbSize, openLightbox } = data
  const index = rowIndex * columnCount + columnIndex
  if (index >= items.length) return null
  const item = items[index]
  const urlRef = useRef(null)

  useEffect(() => {
    let revoked = false
    ;(async () => {
      try {
        const file = item.file || await item.handle.getFile()
        const url = URL.createObjectURL(file)
        if (!revoked) urlRef.current = url
      } catch {}
    })()
    return () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null } }
  }, [item])

  return (
    <div style={style} className="p-1">
      <button onClick={()=>openLightbox(index)} className="group w-full h-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-2 ring-blue-500">
        {item.isImg ? (
          <img loading="lazy" src={urlRef.current || ''} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <video src={urlRef.current || ''} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        )}
      </button>
    </div>
  )
}

function Lightbox({ items, index, onClose, setIndex }) {
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef(null)

  useEffect(()=>{ setZoom(1) },[index])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex(i=>Math.min(i+1, items.length-1))
      if (e.key === 'ArrowLeft') setIndex(i=>Math.max(i-1, 0))
    }
    window.addEventListener('keydown', onKey)
    return ()=>window.removeEventListener('keydown', onKey)
  }, [items.length, onClose, setIndex])

  const item = items[index]
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true
    ;(async () => {
      const file = item.file || await item.handle.getFile()
      const u = URL.createObjectURL(file)
      if (active) setUrl(u)
    })()
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [item])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 text-white flex flex-col">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 text-sm opacity-80">
          <Info className="w-4 h-4" />
          <span>{item.name}</span>
          <span>• {bytesToSize(item.size)}</span>
          {item.resolution && <span>• {item.resolution}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setZoom(z=>Math.max(1, z-0.25))} className="px-2 py-1 bg-white/10 rounded">-</button>
          <span className="w-12 text-center">{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>z+0.25)} className="px-2 py-1 bg-white/10 rounded">+</button>
          <button onClick={onClose} className="ml-2 p-2 bg-white/10 rounded"><X className="w-5 h-5"/></button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center">
        <div style={{ transform: `scale(${zoom})` }} className="origin-center">
          {item.isImg ? (
            <img src={url} alt={item.name} className="max-w-none" />
          ) : (
            <video src={url} controls className="max-w-[90vw] max-h-[80vh]" />
          )}
        </div>
      </div>
      <div className="absolute inset-y-0 left-0 flex items-center">
        <button onClick={()=>setIndex(i=>Math.max(0, i-1))} className="m-2 p-3 bg-white/10 rounded-full"><ChevronLeft className="w-6 h-6"/></button>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center">
        <button onClick={()=>setIndex(i=>Math.min(items.length-1, i+1))} className="m-2 p-3 bg-white/10 rounded-full"><ChevronRight className="w-6 h-6"/></button>
      </div>
    </div>
  )
}

function Hero({ onPickFolder }) {
  return (
    <div className="relative h-[50vh] min-h-[360px] w-full overflow-hidden">
      <Spline scene="https://prod.spline.design/xzUirwcZB9SOxUWt/scene.splinecode" style={{ width: '100%', height: '100%' }} />
      <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-950 via-transparent to-transparent pointer-events-none"></div>
      <div className="absolute inset-0 flex items-end justify-center pb-8">
        <button onClick={onPickFolder} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition">
          <FolderOpen className="w-4 h-4"/> Select Folder
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { dark, setDark } = useDarkMode()
  const { items, setItems, loading, pickFolder } = useFolder()

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [thumbSize, setThumbSize] = useState(140)

  const list = useFilteredSorted(items, query, sortKey)

  const [lbIndex, setLbIndex] = useState(-1)
  const openLightbox = (i) => setLbIndex(i)
  const closeLightbox = () => setLbIndex(-1)

  const containerRef = useRef(null)
  const columnCount = Math.max(1, Math.floor((containerRef.current?.clientWidth || 1200) / (thumbSize)))
  const rowCount = Math.ceil(list.length / columnCount)

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Toolbar query={query} setQuery={setQuery} sortKey={sortKey} setSortKey={setSortKey} thumbSize={thumbSize} setThumbSize={setThumbSize} count={list.length} onPickFolder={pickFolder} dark={dark} setDark={setDark} />

      {items.length === 0 && (
        <Hero onPickFolder={pickFolder} />
      )}

      {loading && (
        <div className="py-20 text-center opacity-70">Scanning folder…</div>
      )}

      {items.length > 0 && (
        <div ref={containerRef} className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <Grid
              columnCount={columnCount}
              columnWidth={thumbSize}
              height={window.innerHeight - 180}
              rowCount={rowCount}
              rowHeight={thumbSize}
              width={containerRef.current?.clientWidth || 1200}
              itemData={{ items: list, columnCount, thumbSize, openLightbox }}
            >
              {Thumb}
            </Grid>
          </div>
        </div>
      )}

      {lbIndex >= 0 && (
        <Lightbox items={list} index={lbIndex} setIndex={setLbIndex} onClose={closeLightbox} />
      )}

      <footer className="py-6 text-center text-sm text-slate-500">
        Local-only • Works offline • No data leaves your device
      </footer>
    </div>
  )
}
