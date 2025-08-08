import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="dark-mode"
export default class extends Controller {
  static targets = ["iconLight", "iconDark"]

  connect() {
    // Listen for system theme changes
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemThemeHandler = (e) => this.handleSystemThemeChange(e)
    this.mediaQuery.addEventListener('change', this.systemThemeHandler)
  }

  disconnect() {
    if (this.mediaQuery && this.systemThemeHandler) {
      this.mediaQuery.removeEventListener('change', this.systemThemeHandler)
    }
  }

  async toggle() {
    const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'

    // Update the server with the new preference
    try {
      const response = await fetch('/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({ theme: newTheme })
      })

      if (response.ok) {
        // Update the UI
        this.setTheme(newTheme)
      }
    } catch (error) {
      console.error('Failed to update theme preference:', error)
      // Fall back to local storage
      localStorage.setItem('theme', newTheme)
      this.setTheme(newTheme)
    }
  }

  setTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    this.updateIcons()
  }

  updateIcons() {
    const isDark = document.documentElement.classList.contains('dark')
    if (this.hasIconLightTarget) {
      this.iconLightTarget.classList.toggle('hidden', isDark)
    }
    if (this.hasIconDarkTarget) {
      this.iconDarkTarget.classList.toggle('hidden', !isDark)
    }
  }

  handleSystemThemeChange(e) {
    // Check if there's a cookie preference by looking at current state
    const hasCookiePreference = document.cookie.includes('theme=')

    // Only respond to system changes if user hasn't set a preference
    if (!hasCookiePreference) {
      // Reload the page to get the new theme from server
      window.location.reload()
    }
  }

  async clearPreference() {
    try {
      await fetch('/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({ theme: '' })
      })

      // Reload to get system preference from server
      window.location.reload()
    } catch (error) {
      console.error('Failed to clear theme preference:', error)
      localStorage.removeItem('theme')
      window.location.reload()
    }
  }
}