import useSpeech from './useSpeech'
import { pronunciationConfigAtom } from '@/store'
import type { PronunciationType } from '@/typings'
import { addHowlListener } from '@/utils'
import { romajiToHiragana } from '@/utils/kana'
import noop from '@/utils/noop'
import type { Howl } from 'howler'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSound from 'use-sound'
import type { HookOptions } from 'use-sound/dist/types'

const pronunciationApi = 'https://dict.youdao.com/dictvoice?audio='
export function generateWordSoundSrc(word: string, pronunciation: Exclude<PronunciationType, false>): string {
  // 如果是包含空格的短语，并且是有道不支持的语言，跳过生成 youdao 音频链接（使用 Web Speech API）
  const isPhrase = word.includes(' ') || word.includes('　')
  if (isPhrase && !['us', 'uk'].includes(pronunciation)) {
    return ''
  }

  const encodedWord = encodeURIComponent(word)

  switch (pronunciation) {
    case 'uk':
      return `${pronunciationApi}${encodedWord}&type=1`
    case 'us':
      return `${pronunciationApi}${encodedWord}&type=2`
    case 'romaji':
      return `${pronunciationApi}${encodeURIComponent(romajiToHiragana(word))}&le=jap`
    case 'zh':
      return `${pronunciationApi}${encodedWord}&le=zh`
    case 'ja':
      return `${pronunciationApi}${encodedWord}&le=jap`
    case 'de':
      return `${pronunciationApi}${encodedWord}&le=de`
    case 'hapin':
    case 'kk':
      return `${pronunciationApi}${encodedWord}&le=ru` // 有道不支持哈萨克语, 暂时用俄语发音兜底
    case 'id':
      return `${pronunciationApi}${encodedWord}&le=id`
    case 'es':
      return `${pronunciationApi}${encodedWord}&le=es`
    default:
      return ''
  }
}

const pronToLang: Record<string, string> = {
  us: 'en-US',
  uk: 'en-GB',
  romaji: 'ja-JP',
  zh: 'zh-CN',
  ja: 'ja-JP',
  de: 'de-DE',
  es: 'es-ES',
  id: 'id-ID',
  hapin: 'ru-RU',
  kk: 'ru-RU',
}

export default function usePronunciationSound(word: string, isLoop?: boolean) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)
  const loop = useMemo(() => (typeof isLoop === 'boolean' ? isLoop : pronunciationConfig.isLoop), [isLoop, pronunciationConfig.isLoop])
  const [isPlaying, setIsPlaying] = useState(false)
  const [youdaoFailed, setYoudaoFailed] = useState(false)
  const isPlayingRef = useRef(false)

  const WEB_SPEECH_LANGUAGES = new Set(['es', 'de', 'id'])
  const isPhrase = word.includes(' ') || word.includes('　')
  const useWebSpeech =
    youdaoFailed || WEB_SPEECH_LANGUAGES.has(pronunciationConfig.type) || (isPhrase && !['us', 'uk'].includes(pronunciationConfig.type))
  const speechLang = pronToLang[pronunciationConfig.type] || 'en-US'

  const {
    speak: playSpeech,
    cancel: stopSpeech,
    speaking,
  } = useSpeech(
    word,
    useMemo(
      () => ({
        lang: speechLang,
        rate: pronunciationConfig.rate,
        volume: pronunciationConfig.volume,
      }),
      [speechLang, pronunciationConfig.rate, pronunciationConfig.volume],
    ),
    loop,
  )

  const youdaoSrc = useMemo(
    () => (useWebSpeech ? '' : generateWordSoundSrc(word, pronunciationConfig.type)),
    [useWebSpeech, word, pronunciationConfig.type],
  )

  const [playYoudao, { stop: stopYoudao, sound }] = useSound(youdaoSrc, {
    html5: true,
    format: ['mp3'],
    loop,
    volume: pronunciationConfig.volume,
    rate: pronunciationConfig.rate,
  } as HookOptions)

  useEffect(() => {
    setYoudaoFailed(false)
  }, [word, pronunciationConfig.type])

  useEffect(() => {
    if (!sound) return
    sound.loop(loop)
    return noop
  }, [loop, sound])

  useEffect(() => {
    if (!sound) return
    const unListens: Array<() => void> = []

    unListens.push(
      addHowlListener(sound, 'play', () => {
        isPlayingRef.current = true
        setIsPlaying(true)
      }),
    )
    unListens.push(
      addHowlListener(sound, 'end', () => {
        isPlayingRef.current = false
        setIsPlaying(false)
      }),
    )
    unListens.push(
      addHowlListener(sound, 'pause', () => {
        isPlayingRef.current = false
        setIsPlaying(false)
      }),
    )
    unListens.push(
      addHowlListener(sound, 'loaderror', () => {
        const shouldFallback = isPlayingRef.current
        isPlayingRef.current = false
        setIsPlaying(false)
        setYoudaoFailed(true)
        if (shouldFallback) {
          playSpeech(true)
        }
      }),
    )
    unListens.push(
      addHowlListener(sound, 'playerror', () => {
        const shouldFallback = isPlayingRef.current
        isPlayingRef.current = false
        setIsPlaying(false)
        setYoudaoFailed(true)
        if (shouldFallback) {
          playSpeech(true)
        }
      }),
    )

    return () => {
      isPlayingRef.current = false
      setIsPlaying(false)
      unListens.forEach((unListen) => unListen())
      ;(sound as Howl).unload()
    }
  }, [playSpeech, sound])

  const play = useCallback(() => {
    if (isPlayingRef.current) {
      stopYoudao()
      stopSpeech()
    }
    isPlayingRef.current = true
    if (useWebSpeech) {
      playSpeech(true)
    } else {
      playYoudao()
    }
  }, [useWebSpeech, playSpeech, playYoudao, stopYoudao, stopSpeech])

  const stop = useCallback(() => {
    isPlayingRef.current = false
    setIsPlaying(false)
    if (useWebSpeech) {
      stopSpeech()
    } else {
      stopYoudao()
    }
  }, [useWebSpeech, stopSpeech, stopYoudao])

  const finalIsPlaying = useWebSpeech ? speaking : isPlaying

  return { play, stop, isPlaying: finalIsPlaying }
}

export function usePrefetchPronunciationSound(word: string | undefined) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)

  useEffect(() => {
    if (!word) return

    const soundUrl = generateWordSoundSrc(word, pronunciationConfig.type)
    if (soundUrl === '') return

    const head = document.head
    const isPrefetch = (Array.from(head.querySelectorAll('link[href]')) as HTMLLinkElement[]).some((el) => el.href === soundUrl)

    if (!isPrefetch) {
      const audio = new Audio()
      audio.src = soundUrl
      audio.preload = 'auto'

      // gpt 说这这两行能尽可能规避下载插件被触发问题。 本地测试不加也可以，考虑到别的插件可能有问题，所以加上保险
      // audio.crossOrigin = 'anonymous' // 移除 crossOrigin 避免 Youdao API 产生 CORS 错误
      audio.style.display = 'none'

      head.appendChild(audio)

      return () => {
        head.removeChild(audio)
      }
    }
  }, [pronunciationConfig.type, word])
}
