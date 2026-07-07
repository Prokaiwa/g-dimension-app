import { describe, it, expect } from 'vitest'
import { getYouTubeId, getYouTubeThumbnail } from './links'

describe('getYouTubeId', () => {
  it('extracts from standard watch URLs', () => {
    expect(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(getYouTubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ')
    expect(getYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from youtu.be short links', () => {
    expect(getYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(getYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc123')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from shorts and embed paths', () => {
    expect(getYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(getYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('returns null for non-YouTube URLs', () => {
    expect(getYouTubeId('https://vimeo.com/12345')).toBeNull()
    expect(getYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('returns null for invalid or empty input', () => {
    expect(getYouTubeId('not a url')).toBeNull()
    expect(getYouTubeId('')).toBeNull()
    expect(getYouTubeId('https://youtu.be/')).toBeNull()
    expect(getYouTubeId('https://www.youtube.com/watch')).toBeNull()
  })
})

describe('getYouTubeThumbnail', () => {
  it('builds the hqdefault thumbnail URL from a video id', () => {
    expect(getYouTubeThumbnail('dQw4w9WgXcQ')).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })
})
