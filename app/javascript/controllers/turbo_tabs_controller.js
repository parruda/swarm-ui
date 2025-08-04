import { Controller } from "@hotwired/stimulus"
import { visit } from "@hotwired/turbo"

export default class extends Controller {
  static targets = ["tab", "frame"]
  static values = { projectId: String }
  
  connect() {
    // Check URL hash to see if we should load a specific tab
    const hash = window.location.hash.substring(1)
    if (hash && hash !== 'swarms') {
      // Find the tab for this hash
      const tab = this.tabTargets.find(t => t.dataset.panel === hash)
      if (tab) {
        this.switchTab({ currentTarget: tab })
      }
    } else {
      // Make sure first tab (swarms) is active by default
      this.activateTab(this.tabTargets[0])
    }
  }
  
  switchTab(event) {
    const tab = event.currentTarget
    const panelName = tab.dataset.panel
    
    // Update URL hash
    window.location.hash = panelName
    
    // Update tab styles
    this.activateTab(tab)
    
    // Load content into turbo frame if not already loaded
    const frame = this.frameTarget
    const frameUrl = tab.dataset.frameUrl
    
    // Check if frame src is already set to this URL
    if (frame.src !== frameUrl) {
      frame.src = frameUrl
    }
  }
  
  activateTab(selectedTab) {
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
  }
}