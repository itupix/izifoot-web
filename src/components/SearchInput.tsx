import type { ChangeEventHandler } from 'react'

type SearchInputProps = {
  value: string
  onChange: ChangeEventHandler<HTMLInputElement>
  placeholder: string
}

export default function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
    />
  )
}
