'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { Tabs } from '@/components/ds/Tabs'
import { IconButton } from '@/components/ds/IconButton'
import {
  SparkleIcon,
  CloseIcon,
  ChevronDownIcon,
  SyncIcon,
  CopyIcon,
  SearchIcon,
  QuoteIcon,
  PlayIcon,
  PauseIcon,
} from '@/components/ds/icons'
import { TranscriptBody } from './TranscriptBody'
import { MediaPlayer } from './MediaPlayer'
import { flattenWords, activeWordIndex } from '@/lib/live/syncEngine'
import { createQuote } from '@/lib/api/quotes'
import { formatClock, formatDate } from '@/lib/i18n/format'
import type { LiveCall } from '@/lib/live/loadCall'
import { CompanyOverview, type CompanyOverviewData } from '@/components/company/CompanyOverview'

export function LiveTranscriptView({ call, overview }: { call: LiveCall; overview?: CompanyOverviewData | null }) {
  const { dict, locale } = useI18n()
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement>(null)

  const [tab, setTab] = useState('transcript')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(call.transcript.durationSec || 0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [autoScroll, setAutoScroll] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const flat = useMemo(() => flattenWords(call.transcript), [call.transcript])
  const activeIndex = useMemo(() => activeWordIndex(flat, currentTime), [flat, currentTime])
  const name = locale === 'en' ? call.companyNameEn ?? call.companyName : call.companyName
  const title = `${name} — ${call.quarter}`

  // smooth karaoke: poll currentTime via rAF while playing
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const a = audioRef.current
      if (a) setCurrentTime(a.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  function seek(t: number) {
    const a = audioRef.current
    if (a) a.currentTime = t
    setCurrentTime(t)
  }
  function playPause() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }
  function skip(delta: number) {
    seek(Math.min(duration, Math.max(0, currentTime + delta)))
  }
  function changeVolume(v: number) {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  function openInChat() {
    if (call.companyId) router.push(`/app/chat?company=${call.companyId}`)
  }

  async function copyAll() {
    const text = call.transcript.segments.map((s) => s.words.map((w) => w.text).join(' ')).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setToast(dict.live.copied)
    } catch {
      /* clipboard may be blocked */
    }
  }

  async function saveQuote() {
    const text = (typeof window !== 'undefined' ? window.getSelection()?.toString() : '')?.trim()
    if (!text) {
      setToast(dict.live.selectToSave)
      return
    }
    if (!call.companyId) {
      setToast(dict.common.error)
      return
    }
    const speaker = call.transcript.segments[flat[activeIndex]?.segmentIndex ?? 0]?.speakerName ?? null
    try {
      await createQuote({
        companyId: call.companyId ?? '',
        transcriptId: call.id === 'demo' ? null : call.id,
        text,
        speaker,
        quarter: call.quarter,
        startSec: currentTime,
      })
      setToast(dict.live.quoteSaved)
    } catch (err) {
      setToast((err as Error).message)
    }
  }

  const liveTabs = [
    { key: 'overview', label: dict.live.overview },
    { key: 'transcript', label: dict.live.transcript },
    { key: 'slides', label: dict.live.slides },
    { key: 'report', label: dict.live.report },
  ]

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {/* header */}
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo src={call.logoUrl} name={title} size={32} />
          <span className="truncate font-bold text-ink">{title}</span>
          <span className="shrink-0 text-sm text-ink-faint">{formatDate(call.date, locale)}</span>
          {call.isLive && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-live" />
              <span className="text-2xs font-bold tracking-wide text-live">{dict.live.liveBadge}</span>
            </span>
          )}
          <IconButton label={dict.live.switchCall} size={26}>
            <ChevronDownIcon size={16} />
          </IconButton>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label={dict.company.openInChat} size={30} onClick={openInChat}>
            <SparkleIcon size={17} />
          </IconButton>
          <IconButton label={dict.common.close} size={30} onClick={() => router.back()}>
            <CloseIcon size={17} />
          </IconButton>
        </div>
      </header>

      {/* tabs + inline audio chip */}
      <div className="px-6">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={liveTabs}
          trailing={
            <button
              type="button"
              onClick={playPause}
              disabled={!call.audioUrl}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              <span>{playing ? dict.live.pauseAudio : dict.live.playAudio}</span>
              <span className="tabular-nums text-ink-faint" dir="ltr">{formatClock(currentTime)}</span>
            </button>
          }
        />
      </div>

      {/* sub-toolbar */}
      <div className="flex items-center justify-between px-6 py-2">
        <div className="flex items-center gap-0.5">
          <IconButton label={dict.live.autoScroll} active={autoScroll} size={30} onClick={() => setAutoScroll((v) => !v)}>
            <SyncIcon size={16} />
          </IconButton>
          <IconButton label={dict.live.copy} size={30} onClick={copyAll}>
            <CopyIcon size={16} />
          </IconButton>
          <IconButton label={dict.live.saveQuote} size={30} onClick={saveQuote}>
            <QuoteIcon size={16} />
          </IconButton>
        </div>
        <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-faint hover:text-ink">
          <SearchIcon size={15} />
          {dict.live.searchTranscript}
        </button>
      </div>

      {/* body */}
      <div className="app-scroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-32 pt-2">
        {tab === 'transcript' ? (
          <>
            {!call.transcript.hasWordTimings && (
              <p className="mb-4 rounded-md bg-subtle px-3 py-2 text-xs text-ink-muted">{dict.live.noWordTimings}</p>
            )}
            <TranscriptBody
              transcript={call.transcript}
              activeIndex={activeIndex}
              autoScroll={autoScroll}
              onWordClick={seek}
              karaoke={call.transcript.hasWordTimings}
            />
          </>
        ) : tab === 'overview' && overview ? (
          <div className="mx-auto w-full max-w-2xl pt-2">
            <CompanyOverview data={overview} />
          </div>
        ) : (
          <div className="grid h-full place-items-center text-sm text-ink-faint">{dict.common.comingSoon}</div>
        )}
      </div>

      {/* hidden audio element drives the sync */}
      {call.audioUrl && (
        <audio
          ref={audioRef}
          src={call.audioUrl}
          preload="metadata"
          onLoadedMetadata={(e) => {
            e.currentTarget.volume = volume
            setDuration(e.currentTarget.duration || duration)
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => !playing && setCurrentTime(e.currentTarget.currentTime)}
        />
      )}

      {call.audioUrl && (
        <MediaPlayer
          logoUrl={call.logoUrl}
          title={name}
          subtitle={call.quarter}
          chapter={call.isLive ? 'Live session' : undefined}
          currentTime={currentTime}
          duration={duration}
          playing={playing}
          isLive={call.isLive}
          volume={volume}
          onPlayPause={playPause}
          onSeek={seek}
          onSkip={skip}
          onVolumeChange={changeVolume}
          onClose={() => router.back()}
        />
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
          <span className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white shadow-popover">{toast}</span>
        </div>
      )}
    </div>
  )
}
