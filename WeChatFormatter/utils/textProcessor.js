export function preprocessText(text) {
  if (!text || typeof text !== 'string') return ''

  let result = text

  // Normalize line endings
  result = result.replace(/\r\n/g, '\n')
  result = result.replace(/\r/g, '\n')

  // Remove zero-width characters
  result = result.replace(/[\u200B-\u200D\uFEFF]/g, '')

  // Remove trailing spaces on each line
  result = result.replace(/[ \t]+$/gm, '')

  // Collapse multiple consecutive empty lines into one
  result = result.replace(/\n{3,}/g, '\n\n')

  // Normalize tabs to spaces (2 spaces)
  result = result.replace(/\t/g, '  ')

  return result.trim()
}
