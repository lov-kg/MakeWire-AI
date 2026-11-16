import { useEffect, useState } from 'react'

export type DeviceType = 'mobile' | 'tablet' | 'laptop' | 'desktop'
export type Orientation = 'portrait' | 'landscape'

// Mirrors Tailwind's breakpoints (sm 640 / md 768 / lg 1024 / xl 1280).
const BREAKPOINTS: Record<DeviceType, { min: number; max: number }> = {
  mobile: { min: 0, max: 639 },
  tablet: { min: 640, max: 1023 },
  laptop: { min: 1024, max: 1279 },
  desktop: { min: 1280, max: Infinity },
}

export const classifyDevice = (width: number): DeviceType => {
  for (const [type, limits] of Object.entries(BREAKPOINTS)) {
    if (width >= limits.min && width <= limits.max) return type as DeviceType
  }
  return 'desktop'
}

export interface ViewportState {
  width: number
  height: number
  deviceType: DeviceType
  orientation: Orientation
  isMobile: boolean
  isTablet: boolean
  isLaptop: boolean
  isDesktop: boolean
  isPortrait: boolean
  isLandscape: boolean
  isTouch: boolean
}

const detectTouch = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  } catch {
    return false
  }
}

const getViewport = (): ViewportState => {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: 800,
      deviceType: 'desktop',
      orientation: 'landscape',
      isMobile: false,
      isTablet: false,
      isLaptop: false,
      isDesktop: true,
      isPortrait: false,
      isLandscape: true,
      isTouch: false,
    }
  }
  const width = window.innerWidth
  const height = window.innerHeight
  const deviceType = classifyDevice(width)
  const orientation: Orientation = height >= width ? 'portrait' : 'landscape'
  return {
    width,
    height,
    deviceType,
    orientation,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isLaptop: deviceType === 'laptop',
    isDesktop: deviceType === 'desktop',
    isPortrait: orientation === 'portrait',
    isLandscape: orientation === 'landscape',
    isTouch: detectTouch(),
  }
}

/**
 * Tracks the viewport, orientation and input type, reflecting them on
 * document.documentElement as data attributes so CSS can key off them
 * alongside Tailwind media queries.
 */
export function useViewport(): ViewportState {
  const [state, setState] = useState<ViewportState>(getViewport)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setState(getViewport())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const visualViewport = window.visualViewport
    visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const doc = document.documentElement
    doc.setAttribute('data-device-type', state.deviceType)
    doc.setAttribute('data-viewport-width', String(state.width))
    doc.setAttribute('data-orientation', state.orientation)
    doc.setAttribute('data-touch', state.isTouch ? 'true' : 'false')
  }, [state])

  return state
}
