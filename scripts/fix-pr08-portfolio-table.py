from pathlib import Path

path = Path('apps/desktop/src/features/legacy-pages.tsx')
text = path.read_text(encoding='utf-8')

marker = '\x01'
if text.count(marker) != 1:
    raise SystemExit(f'expected exactly one control-character placeholder, found {text.count(marker)}')

status_cell = '''<td>
                        <Badge
                          className={position.stale ? 'tag warning' : 'tag'}
                          variant="secondary"
                        >
                          {position.stale ? '陈旧' : '最新'}
                        </Badge>
                      </td>'''

text = text.replace(marker, status_cell)
remaining_controls = sorted({ord(char) for char in text if ord(char) < 32 and char not in '\n\r\t'})
if remaining_controls:
    raise SystemExit(f'unexpected remaining control characters: {remaining_controls}')

path.write_text(text, encoding='utf-8')
