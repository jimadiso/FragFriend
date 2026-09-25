type Props = {
  chips: { key: string; label: string }[]
  disabled: boolean
  onRemove: (key: string) => void
  onClear: () => void
}

export default function ActiveFilterTags({ chips, disabled, onRemove, onClear }: Props) {
  if (!chips.length) return null
  return <section className="active-filter-tags" aria-label="Active filters">
    <span>Active filters</span>
    <div className="active-filter-list">
      {chips.map(chip => <button type="button" key={chip.key} disabled={disabled}
        onClick={() => onRemove(chip.key)} aria-label={`Remove ${chip.label}`}>
        {chip.label} <span aria-hidden="true">×</span>
      </button>)}
      <button type="button" className="clear-filter-tags" disabled={disabled} onClick={onClear}>Clear all</button>
    </div>
  </section>
}
