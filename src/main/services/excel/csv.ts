/**
 * Minimal, dependency-free CSV parser.
 * Handles quoted fields, escaped quotes ("") and CRLF/CR/LF line endings.
 * Delimiter is sniffed from the first line (comma, semicolon, tab).
 */

export function detectDelimiter(line: string): string {
  const counts: Array<[string, number]> = [
    [',', count(line, ',')],
    [';', count(line, ';')],
    ['\t', count(line, '\t')],
  ]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

function count(s: string, ch: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) if (s[i] === ch) n++
  return n
}

export function parseCsv(text: string): string[][] {
  const firstLineEnd = text.search(/\r?\n/)
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd)
  const delimiter = detectDelimiter(firstLine)
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else if (ch === '\r') {
      pushRow()
      if (text[i + 1] === '\n') i++
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) pushRow()

  // Drop completely empty trailing rows.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop()
  return rows
}
