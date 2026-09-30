import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

const CONTROL_CLASSES =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900'

export interface FieldWrapperProps {
  label?: string
  hint?: string
  error?: string | null
  required?: boolean
  children: ReactNode
  className?: string
}

export function FieldWrapper({ label, hint, error, required, children, className }: FieldWrapperProps) {
  return (
    <label className={cn('block', className)}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          {label}
          {required ? <span className="text-rose-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string | null
}

export function Input({ label, hint, error, className, required, ...rest }: InputProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <input className={cn(CONTROL_CLASSES, error && 'border-rose-400 dark:border-rose-500', className)} required={required} {...rest} />
    </FieldWrapper>
  )
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string | null
  options?: Array<{ value: string; label: string }>
  placeholder?: string
}

export function Select({ label, hint, error, options, placeholder, className, required, children, ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <select className={cn(CONTROL_CLASSES, 'appearance-none', error && 'border-rose-400 dark:border-rose-500', className)} required={required} {...rest}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
    </FieldWrapper>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string | null
}

export function Textarea({ label, hint, error, className, required, ...rest }: TextareaProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <textarea className={cn(CONTROL_CLASSES, 'min-h-20 resize-y', error && 'border-rose-400 dark:border-rose-500', className)} required={required} {...rest} />
    </FieldWrapper>
  )
}

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

export function Checkbox({ label, hint, className, id, ...rest }: CheckboxProps) {
  const inputId = id ?? `cb-${Math.random().toString(36).slice(2, 9)}`
  return (
    <label htmlFor={inputId} className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-950"
        {...rest}
      />
      {label ? (
        <span className="text-sm text-slate-700 dark:text-slate-200">
          {label}
          {hint ? <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">{hint}</span> : null}
        </span>
      ) : null}
    </label>
  )
}
