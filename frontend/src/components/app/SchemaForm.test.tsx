import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SchemaForm } from './SchemaForm'
import type { Manifest, ManifestEntity } from '../../lib/types'

const customer: ManifestEntity = {
  key: 'customer',
  label: 'Customer',
  plural_label: 'Customers',
  description: '',
  title_field: 'name',
  code_prefix: 'CUS',
  state: null,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, description: '', options: [], ref_entity: null, default: null, system: false },
    { key: 'email', label: 'Email', type: 'email', required: true, description: '', options: [], ref_entity: null, default: null, system: false },
    { key: 'deposit', label: 'Deposit', type: 'money', required: false, description: '', options: [], ref_entity: null, default: null, system: false },
  ],
}

const manifest = { entities: [customer], rules: [] } as unknown as Manifest

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SchemaForm slug="demo" manifest={manifest} entity={customer} fieldKeys={['name', 'email', 'deposit']} submitLabel="Create" onSubmit={onSubmit} />
    </QueryClientProvider>,
  )
  return onSubmit
}

describe('SchemaForm', () => {
  it('validates required and typed fields before submitting', async () => {
    const onSubmit = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Email/), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('converts values to typed payloads', async () => {
    const onSubmit = setup()
    await userEvent.type(screen.getByLabelText(/Name/), 'Lena')
    await userEvent.type(screen.getByLabelText(/Email/), 'lena@example.com')
    await userEvent.type(screen.getByLabelText(/Deposit/), '1,250.5')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Lena', email: 'lena@example.com', deposit: 1250.5 })
  })

  it('shows server-side rule rejections on the form', async () => {
    const err = Object.assign(new Error('Canon is rented'), { body: { message: 'Canon is rented', rule: { id: 'r', statement: 'x', kind: 'k', source: 's' }, field_errors: { name: 'Taken' } } })
    setup(vi.fn().mockRejectedValue(err))
    await userEvent.type(screen.getByLabelText(/Name/), 'Lena')
    await userEvent.type(screen.getByLabelText(/Email/), 'lena@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Rule enforced: Canon is rented')
    expect(screen.getByText('Taken')).toBeInTheDocument()
  })
})
