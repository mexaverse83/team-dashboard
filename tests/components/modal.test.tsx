import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from '@/components/ui/modal'

describe('accessible mobile dialog', () => {
  it('uses a portal, traps keyboard focus, closes on Escape and restores the trigger', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const close = vi.fn()
    const { rerender, container } = render(<Modal open onClose={close} title="New transaction"><input aria-label="Amount" /><button>Save</button></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'New transaction' })
    expect(container.contains(dialog)).toBe(false)
    expect(dialog).toHaveFocus()
    screen.getByRole('button', { name: 'Save' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    rerender(<Modal open={false} onClose={close} title="New transaction">Done</Modal>)
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
