import SearchInput from './SearchInput'

type Option = { value: string; label: string }

type SearchSelectBarProps = {
  query: string
  onQueryChange: (value: string) => void
  queryPlaceholder: string
  selectValue: string
  onSelectChange: (value: string) => void
  selectPlaceholder: string
  options: Option[]
}

export default function SearchSelectBar({
  query,
  onQueryChange,
  queryPlaceholder,
  selectValue,
  onSelectChange,
  selectPlaceholder,
  options,
}: SearchSelectBarProps) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12 }}>
        <SearchInput
          placeholder={queryPlaceholder}
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
        <select
          value={selectValue}
          onChange={e => onSelectChange(e.target.value)}
          style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
        >
          <option value="">{selectPlaceholder}</option>
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
