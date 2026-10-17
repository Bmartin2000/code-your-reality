import { describe, expect, it } from 'vitest'
import { parseCsv } from './ImportDialog'

describe('parseCsv', () => {
  it('reads comma files with quotes and a BOM', () => {
    const rows = parseCsv(String.fromCharCode(0xfeff) + 'Name,Notes\n"Canon, R6","say ""hi"""\nTripod,\n')
    expect(rows).toEqual([
      { Name: 'Canon, R6', Notes: 'say "hi"' },
      { Name: 'Tripod', Notes: '' },
    ])
  })

  it('detects semicolons (Excel in many EU locales) and skips blank lines', () => {
    expect(parseCsv('Name;Type\r\nLens;Lens\r\n\r\n')).toEqual([{ Name: 'Lens', Type: 'Lens' }])
  })
})
