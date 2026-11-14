import { describe, expect, it } from 'vitest'
import { FEATURED_TAG, LAYOUT_TAG, PORTFOLIO_TAG, localeTag, mediaTag, projectTag } from '../src/cache-tags'

describe('cache tags', () => {
  it('builds one tag per project from its id, never from the slug', () => {
    expect(projectTag(7)).toBe('project:7')
    expect(projectTag('abc')).toBe('project:abc')
  })

  it('keeps image and video ids apart', () => {
    expect(mediaTag('images', 3)).toBe('media:images:3')
    expect(mediaTag('videos', 3)).toBe('media:videos:3')
  })

  it('builds locale tags', () => {
    expect(localeTag('it')).toBe('locale:it')
    expect(localeTag('en')).toBe('locale:en')
  })

  it('uses separate tags for the homepage list, the portfolio list and the layout', () => {
    expect(new Set([FEATURED_TAG, PORTFOLIO_TAG, LAYOUT_TAG]).size).toBe(3)
  })

  it('never contains a comma, which the Vercel tag header uses as separator', () => {
    for (const tag of [FEATURED_TAG, PORTFOLIO_TAG, LAYOUT_TAG, projectTag(1), mediaTag('images', 1), localeTag('it')]) {
      expect(tag).not.toContain(',')
    }
  })
})
