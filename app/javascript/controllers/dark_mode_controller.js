import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="dark-mode"
export default class extends Controller {
  static targets = ["iconLight", "iconDark"]

  connect() {
    // Check for saved preference or system preference
    this.initializeDarkMode()
    
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

  initializeDarkMode() {
    const savedTheme = localStorage.getItem('theme')
    
    if (savedTheme) {
      // User has explicitly chosen a theme
      this.setTheme(savedTheme)
    } else {
      // No saved preference, use system preference
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      this.setTheme(systemPrefersDark ? 'dark' : 'light')
    }
  }

  toggle() {
    const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
    
    // Save user preference
    localStorage.setItem('theme', newTheme)
    this.setTheme(newTheme)
  }

  setTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      if (this.hasIconLightTarget) this.iconLightTarget.classList.add('hidden')
      if (this.hasIconDarkTarget) this.iconDarkTarget.classList.remove('hidden')
    } else {
      document.documentElement.classList.remove('dark')
      if (this.hasIconLightTarget) this.iconLightTarget.classList.remove('hidden')
      if (this.hasIconDarkTarget) this.iconDarkTarget.classList.add('hidden')
    }
  }

  handleSystemThemeChange(e) {
    // Only respond to system changes if user hasn't set a preference
    if (!localStorage.getItem('theme')) {
      this.setTheme(e.matches ? 'dark' : 'light')
    }
  }

  clearPreference() {
    localStorage.removeItem('theme')
    this.initializeDarkMode()
  }
}