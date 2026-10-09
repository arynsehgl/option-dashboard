/** Verifies that every successful Firebase authentication path opens the zone launcher. */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  signup: vi.fn(),
  signInWithGoogle: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}))

vi.mock('../components/BrandMark', () => ({
  default: () => <span>Stride</span>,
}))

vi.mock('../components/ThemeToggle', () => ({
  default: () => <button type="button">Theme</button>,
}))

describe('LoginPage workspace routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.login.mockResolvedValue({})
    authMocks.signup.mockResolvedValue({})
    authMocks.signInWithGoogle.mockResolvedValue({})
  })

  it.each([
    ['email sign-in', false],
    ['email sign-up', true],
  ])('routes successful %s directly to the zone launcher', async (_label, signUp) => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/zones" element={<div>Zone launcher</div>} />
        </Routes>
      </MemoryRouter>,
    )

    if (signUp) {
      await user.click(screen.getByRole('tab', { name: 'Sign up' }))
      await user.type(screen.getByLabelText('Full name'), 'Existing User')
      await user.type(screen.getByLabelText('Phone number'), '+91 98765 43210')
    }
    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'password')
    fireEvent.submit(screen.getByRole('button', { name: signUp ? /Create account/i : /Enter workspace/i }).closest('form'))

    await waitFor(() => expect(screen.getByText('Zone launcher')).toBeInTheDocument())
    if (signUp) expect(authMocks.signup).toHaveBeenCalledWith('user@example.com', 'password', 'Existing User', '+91 98765 43210')
    else expect(authMocks.login).toHaveBeenCalledWith('user@example.com', 'password')
  })

  it.each([
    ['Google sign-in', false],
    ['Google sign-up', true],
  ])('routes successful %s directly to the zone launcher', async (_label, signUp) => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/zones" element={<div>Zone launcher</div>} />
        </Routes>
      </MemoryRouter>,
    )

    if (signUp) await user.click(screen.getByRole('tab', { name: 'Sign up' }))
    await user.click(screen.getByRole('button', { name: /Continue with Google/i }))

    await waitFor(() => expect(screen.getByText('Zone launcher')).toBeInTheDocument())
    expect(authMocks.signInWithGoogle).toHaveBeenCalledWith(signUp)
  })
})
