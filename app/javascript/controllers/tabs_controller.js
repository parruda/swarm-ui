import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tab", "panel"]
  static values = { activeTab: String }

  connect() {
    if (!this.activeTabValue) {
      // Find the active tab by checking for the active class
      const activeTab = this.tabTargets.find(tab => 
        tab.classList.contains("border-orange-500") || tab.classList.contains("border-emerald-500")
      )
      this.activeTabValue = activeTab?.dataset.tab || "session-info"
    }
    this.showTab(this.activeTabValue)
  }

  select(event) {
    event.preventDefault()
    const tabName = event.currentTarget.dataset.tab
    this.activeTabValue = tabName
    this.showTab(tabName)
  }

  switchTab(event) {
    event.preventDefault()
    const tabName = event.currentTarget.dataset.tab
    this.activeTabValue = tabName
    this.showTab(tabName)
  }

  showTab(tabName) {
    this.tabTargets.forEach(tab => {
      if (tab.dataset.tab === tabName) {
        // Support both new gradient style and old styles
        if (this.element.closest('.swarm-templates-index')) {
          // New gradient style for swarm templates
          tab.classList.add("text-white", "bg-gradient-to-r", "from-orange-500", "to-orange-600", "dark:from-orange-700", "dark:to-orange-800", "shadow-md")
          tab.classList.remove("text-gray-700", "dark:text-gray-300", "hover:text-gray-900", "dark:hover:text-gray-100", "hover:bg-gray-100", "dark:hover:bg-gray-700/50")
        } else if (tab.classList.contains("border-b-2")) {
          // Old style with bottom border
          tab.classList.add("border-orange-500", "text-orange-600", "dark:text-orange-400")
          tab.classList.remove("border-transparent", "text-gray-500", "dark:text-gray-400")
        } else {
          // Session style
          tab.classList.add("border-emerald-500", "text-white")
          tab.classList.remove("border-transparent", "text-slate-400")
        }
      } else {
        if (this.element.closest('.swarm-templates-index')) {
          // New gradient style inactive state
          tab.classList.remove("text-white", "bg-gradient-to-r", "from-orange-500", "to-orange-600", "dark:from-orange-700", "dark:to-orange-800", "shadow-md")
          tab.classList.add("text-gray-700", "dark:text-gray-300", "hover:text-gray-900", "dark:hover:text-gray-100", "hover:bg-gray-100", "dark:hover:bg-gray-700/50")
        } else if (tab.classList.contains("border-b-2")) {
          // Old style inactive
          tab.classList.remove("border-orange-500", "text-orange-600", "dark:text-orange-400")
          tab.classList.add("border-transparent", "text-gray-500", "dark:text-gray-400")
        } else {
          // Session style inactive
          tab.classList.remove("border-emerald-500", "text-white")
          tab.classList.add("border-transparent", "text-slate-400")
        }
      }
    })

    this.panelTargets.forEach(panel => {
      const panelTab = panel.dataset.panel || panel.dataset.tab
      if (panelTab === tabName) {
        panel.classList.remove("hidden")
        
        // If it's a turbo frame and hasn't been loaded yet, trigger loading
        if (panel.tagName === "TURBO-FRAME" && !panel.hasAttribute("complete")) {
          panel.reload()
        }
      } else {
        panel.classList.add("hidden")
      }
    })
  }
}