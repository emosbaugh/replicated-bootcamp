import { test, expect } from '@playwright/test'

const email = `test-${Date.now()}@example.com`
const password = 'TestPass123!'
const franchiseName = 'THE TESTERS'

test.describe('signup and login', () => {
  test('signup creates account and redirects to /game', async ({ page }) => {
    await page.goto('/signup')

    await page.getByPlaceholder('FRANCHISE NAME (e.g. THE CRUSHERS)').fill(franchiseName)
    await page.getByPlaceholder('EMAIL').fill(email)
    await page.getByPlaceholder('PASSWORD').fill(password)
    await page.getByRole('button', { name: 'CREATE FRANCHISE + DRAFT TEAM' }).click()

    await expect(page).toHaveURL('/game', { timeout: 15_000 })
  })

  test('login with existing account redirects to /game', async ({ page }) => {
    await page.goto('/')

    await page.getByPlaceholder('EMAIL').fill(email)
    await page.getByPlaceholder('PASSWORD').fill(password)
    await page.getByRole('button', { name: 'LOGIN' }).click()

    await expect(page).toHaveURL('/game', { timeout: 15_000 })
  })

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/')

    await page.getByPlaceholder('EMAIL').fill(email)
    await page.getByPlaceholder('PASSWORD').fill('wrongpassword')
    await page.getByRole('button', { name: 'LOGIN' }).click()

    await expect(page.getByText('Invalid email or password')).toBeVisible()
  })
})
