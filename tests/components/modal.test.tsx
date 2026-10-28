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

  it('closes when the sheet is dragged down from its header, and springs back on a short drag', () => {
    const close = vi.fn()
    render(<Modal open onClose={close} title="Edit budget"><p>Body</p></Modal>)
    const area = screen.getByTestId('modal-drag-area')
    const dialog = screen.getByRole('dialog', { name: 'Edit budget' })

    fireEvent.pointerDown(area, { clientY: 100, pointerId: 1, button: 0 })
    fireEvent.pointerMove(area, { clientY: 140, pointerId: 1 })
    expect(dialog.style.translate).toBe('0 40px')
    fireEvent.pointerUp(area, { clientY: 140, pointerId: 1 })
    expect(close).not.toHaveBeenCalled()
    expect(dialog.style.translate).toBe('')

    fireEvent.pointerDown(area, { clientY: 100, pointerId: 2, button: 0 })
    fireEvent.pointerMove(area, { clientY: 260, pointerId: 2 })
    fireEvent.pointerUp(area, { clientY: 260, pointerId: 2 })
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not start a drag from the close button or on the full-screen variant', () => {
    const close = vi.fn()
    const { rerender } = render(<Modal open onClose={close} title="Sheet"><p>Body</p></Modal>)
    const closeButton = screen.getByRole('button', { name: 'Close' })
    fireEvent.pointerDown(closeButton, { clientY: 100, pointerId: 1, button: 0 })
    fireEvent.pointerMove(screen.getByTestId('modal-drag-area'), { clientY: 400, pointerId: 1 })
    fireEvent.pointerUp(screen.getByTestId('modal-drag-area'), { clientY: 400, pointerId: 1 })
    expect(close).not.toHaveBeenCalled()

    rerender(<Modal open onClose={close} title="Sheet" mobileFullScreen><p>Body</p></Modal>)
    const area = screen.getByTestId('modal-drag-area')
    fireEvent.pointerDown(area, { clientY: 100, pointerId: 3, button: 0 })
    fireEvent.pointerMove(area, { clientY: 400, pointerId: 3 })
    fireEvent.pointerUp(area, { clientY: 400, pointerId: 3 })
    expect(close).not.toHaveBeenCalled()
  })
})
