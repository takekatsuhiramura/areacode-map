interface Props {
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear: () => void
  disableDigits: boolean
  disableEdit: boolean
}

const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

export default function Keypad({ onDigit, onBackspace, onClear, disableDigits, disableEdit }: Props) {
  return (
    <div className="keypad" role="group" aria-label="テンキー">
      {ROWS.flat().map((d) => (
        <button key={d} type="button" className="key" disabled={disableDigits} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button type="button" className="key key-sub" disabled={disableEdit} onClick={onClear} aria-label="クリア">
        クリア
      </button>
      <button type="button" className="key" disabled={disableDigits} onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className="key key-sub" disabled={disableEdit} onClick={onBackspace} aria-label="1文字削除">
        ⌫
      </button>
    </div>
  )
}
