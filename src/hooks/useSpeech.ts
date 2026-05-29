import React, { useCallback, useEffect, useState } from 'react'

export type UseSpeechResult = {
  /**
   * Speak speaking
   * @param {boolean} [abort=false] Whether to cancel other speak
   */
  speak: (abort?: boolean) => void
  /**
   * Cancel speaking
   */
  cancel: () => void
  /**
   * Whether currently speaking
   */
  speaking: boolean
}

/**
 * React hook for using the SpeechSynthesis API.
 * @param {string} text The text to be spoken.
 * @param {Partial<SpeechSynthesisUtterance>} option SpeechSynthesisUtterance API option. {@link https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance#instance_properties}
 * @returns {Object} An object containing `speak`, `cancel` methods and `speaking` state.
 * @throws {Error} If browser not support SpeechSynthesis API.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API}
 */
export default function useSpeech(text: string, option?: Partial<SpeechSynthesisUtterance>, loop = false): UseSpeechResult {
  const [speaking, setSpeaking] = useState(false)
  const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null)
  const isCancelledRef = React.useRef(false)
  const loopRef = React.useRef(loop)
  const loopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  loopRef.current = loop

  const clearLoopTimer = React.useCallback(() => {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current)
      loopTimerRef.current = null
    }
  }, [])

  const clearResumeInterval = React.useCallback(() => {
    if (resumeIntervalRef.current) {
      clearInterval(resumeIntervalRef.current)
      resumeIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      console.error('SpeechSynthesis API is not supported in this browser')
      return
    }

    const newUtterance = new SpeechSynthesisUtterance(text)
    Object.assign(newUtterance, option)

    const setVoice = () => {
      const voices = synth.getVoices()
      if (voices.length > 0) {
        const lang = option?.lang || 'en-US'
        const langBase = lang.split('-')[0]
        const isEnglish = langBase === 'en'
        const findVoice = (predicate: (v: SpeechSynthesisVoice) => boolean) => voices.find(predicate)

        const googleVoice = findVoice((v) => v.lang === lang && v.name.includes('Google'))
        const exactVoice = findVoice((v) => v.lang === lang)
        const prefixVoice = isEnglish ? null : findVoice((v) => v.lang.startsWith(langBase))

        const matchedVoice = googleVoice || exactVoice || prefixVoice
        if (matchedVoice) {
          newUtterance.voice = matchedVoice
        }
      }
    }

    setVoice()

    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.addEventListener('voiceschanged', setVoice)
    }

    setUtterance(newUtterance)

    return () => {
      isCancelledRef.current = true
      clearLoopTimer()
      clearResumeInterval()
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.removeEventListener('voiceschanged', setVoice)
      }
      synth.cancel()
      setSpeaking(false)
    }
  }, [clearLoopTimer, clearResumeInterval, option, text])

  useEffect(() => {
    if (!utterance) return

    const onend = () => {
      if (isCancelledRef.current) {
        setSpeaking(false)
        return
      }
      if (loopRef.current) {
        clearLoopTimer()
        loopTimerRef.current = setTimeout(() => {
          loopTimerRef.current = null
          if (isCancelledRef.current || !loopRef.current) {
            setSpeaking(false)
            return
          }
          window.speechSynthesis.speak(utterance)
        }, 500)
      } else {
        setSpeaking(false)
      }
    }

    utterance.addEventListener('end', onend)
    return () => {
      clearLoopTimer()
      utterance.removeEventListener('end', onend)
    }
  }, [utterance, clearLoopTimer])

  React.useEffect(() => {
    clearResumeInterval()
    if (!speaking) return

    const synth = window.speechSynthesis
    if (!synth) return

    const needsResume = typeof chrome !== 'undefined' && /Chrome\/(\d+)/.test(navigator.userAgent)
    if (needsResume) {
      resumeIntervalRef.current = setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause()
          synth.resume()
        }
      }, 10000)
    }

    return () => clearResumeInterval()
  }, [speaking, clearResumeInterval])

  const speak = useCallback(
    (abort = false) => {
      if (utterance) {
        const synth = window.speechSynthesis
        if (abort && synth.speaking) {
          synth.cancel()
        }
        clearLoopTimer()
        isCancelledRef.current = false
        setSpeaking(true)
        if (!utterance.voice) {
          const voices = synth.getVoices()
          const lang = option?.lang || 'en-US'
          const langBase = lang.split('-')[0]
          const isEnglish = langBase === 'en'
          const findVoice = (predicate: (v: SpeechSynthesisVoice) => boolean) => voices.find(predicate)

          const googleVoice = findVoice((v) => v.lang === lang && v.name.includes('Google'))
          const exactVoice = findVoice((v) => v.lang === lang)
          const prefixVoice = isEnglish ? null : findVoice((v) => v.lang.startsWith(langBase))

          utterance.voice = googleVoice || exactVoice || prefixVoice || null
        }
        synth.speak(utterance)
      }
    },
    [utterance, option?.lang, clearLoopTimer],
  )

  const cancel = useCallback(() => {
    isCancelledRef.current = true
    clearLoopTimer()
    clearResumeInterval()
    const synth = window.speechSynthesis
    if (synth.speaking || synth.pending) {
      synth.cancel()
    }
    setSpeaking(false)
  }, [clearResumeInterval, clearLoopTimer])

  return {
    speak,
    cancel,
    speaking,
  }
}
