import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tab", "frame"]
  static values = { projectId: String }
  
  connect() {
    // Set up hash change listener for browser back/forward
    this.handleHashChange = this.onHashChange.bind(this)
    window.addEventListener('hashchange', this.handleHashChange)
    
    // Check URL hash to see if we should load a specific tab
    this.loadTabFromHash()
  }
  
  disconnect() {
    // Clean up event listener
    window.removeEventListener('hashchange', this.handleHashChange)
  }
  
  onHashChange() {
    // Handle browser back/forward navigation
    this.loadTabFromHash()
  }
  
  loadTabFromHash() {
    const hash = window.location.hash.substring(1)
    if (hash) {
      // Find the tab for this hash
      const tab = this.tabTargets.find(t => t.dataset.panel === hash)
      if (tab) {
        this.switchTabWithoutHashUpdate({ currentTarget: tab })
      }
    } else if (this.tabTargets.length > 0) {
      // No hash means show the default tab (swarms)
      const defaultTab = this.tabTargets[0]
      this.activateTab(defaultTab)
      // Load the default tab's content if frame is empty
      const frame = this.frameTarget
      if (!frame.src || frame.src === '') {
        frame.src = defaultTab.dataset.frameUrl
      }
    }
  }
  
  switchTab(event) {
    const tab = event.currentTarget
    const panelName = tab.dataset.panel
    
    // Update URL hash - but for the default tab (swarms), remove the hash
    if (panelName === 'swarms') {
      // Use replaceState to avoid creating a history entry when going to default tab
      history.replaceState(null, '', window.location.pathname + window.location.search)
    } else {
      window.location.hash = panelName
    }
    
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
  
  switchTabWithoutHashUpdate(event) {
    const tab = event.currentTarget
    
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