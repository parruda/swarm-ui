import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tab", "panel"]

  connect() {
    // Make sure first tab is selected by default
    this.showTab(this.tabTargets[0])
  }

  switchTab(event) {
    const tab = event.currentTarget
    this.showTab(tab)
  }

  showTab(selectedTab) {
    const panelName = selectedTab.dataset.tab

    // Update tab styles
    this.tabTargets.forEach(tab => {
      if (tab === selectedTab) {
        // Active tab
        tab.classList.remove("border-transparent", "text-gray-500", "dark:text-gray-400", "hover:border-gray-300", "dark:hover:border-gray-600", "hover:text-gray-700", "dark:hover:text-gray-200")
        tab.classList.add("border-orange-500", "dark:border-orange-400", "text-orange-600", "dark:text-orange-400")
      } else {
        // Inactive tab
        tab.classList.remove("border-orange-500", "dark:border-orange-400", "text-orange-600", "dark:text-orange-400")
        tab.classList.add("border-transparent", "text-gray-500", "dark:text-gray-400", "hover:border-gray-300", "dark:hover:border-gray-600", "hover:text-gray-700", "dark:hover:text-gray-200")
      }
    })

    // Show/hide panels
    this.panelTargets.forEach(panel => {
      if (panel.dataset.panel === panelName) {
        panel.classList.remove("hidden")
      } else {
        panel.classList.add("hidden")
      }
    })

    // Store active tab in URL hash for direct linking
    window.location.hash = panelName
  }

  initialize() {
    // Check if there's a hash in the URL and switch to that tab
    if (window.location.hash) {
      const targetPanel = window.location.hash.substring(1)
      const targetTab = this.tabTargets.find(tab => tab.dataset.tab === targetPanel)
      if (targetTab) {
        this.showTab(targetTab)
      }
    }
  }
}