import { describe, it, expect } from 'vitest';

import { youtubeEmbedUrl, youtubeId } from '../youtube.js';

describe('youtubeId', () => {
  it.each([
    ['https://youtu.be/OCIQ9DEDE8c', 'OCIQ9DEDE8c'],
    ['https://youtu.be/OCIQ9DEDE8c?si=abc123', 'OCIQ9DEDE8c'],
    ['https://www.youtube.com/watch?v=OCIQ9DEDE8c', 'OCIQ9DEDE8c'],
    ['https://youtube.com/watch?v=OCIQ9DEDE8c&t=42s', 'OCIQ9DEDE8c'],
    ['https://m.youtube.com/watch?v=OCIQ9DEDE8c', 'OCIQ9DEDE8c'],
    ['https://www.youtube.com/embed/OCIQ9DEDE8c', 'OCIQ9DEDE8c'],
    ['https://www.youtube.com/shorts/OCIQ9DEDE8c', 'OCIQ9DEDE8c'],
    ['  https://youtu.be/OCIQ9DEDE8c  ', 'OCIQ9DEDE8c'],
  ])('reads %s', (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });

  it.each([
    [null],
    [''],
    ['not a url'],
    ['https://vimeo.com/123456789'],
    // A `v` parameter on somebody else's host is not a YouTube video.
    ['https://evil.example.com/watch?v=OCIQ9DEDE8c'],
    // Not eleven characters from YouTube's alphabet.
    ['https://youtu.be/short'],
    ['https://youtu.be/has spaces!'],
  ])('refuses %s', (url) => {
    expect(youtubeId(url)).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  it('uses the privacy-enhanced player and starts playing', () => {
    const src = youtubeEmbedUrl('OCIQ9DEDE8c');

    expect(src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/OCIQ9DEDE8c\?/);
    expect(src).toContain('autoplay=1');
  });
});
