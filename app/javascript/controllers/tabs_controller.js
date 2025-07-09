import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tab", "panel"]
  static values = { activeTab: String }

  connect() {
    if (!this.activeTabValue) {
      this.activeTabValue = "session-info"
    }
    this.showTab(this.activeTabValue)
  }

  switchTab(event) {
    const tabName = event.currentTarget.dataset.tab
    this.activeTabValue = tabName
    this.showTab(tabName)
  }

  showTab(tabName) {
    this.tabTargets.forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add("border-emerald-500", "text-white")
        tab.classList.remove("border-transparent", "text-slate-400")
      } else {
        tab.classList.remove("border-emerald-500", "text-white")
        tab.classList.add("border-transparent", "text-slate-400")
      }
    })

    this.panelTargets.forEach(panel => {
      if (panel.dataset.panel === tabName) {
        panel.classList.remove("hidden")
      } else {
        panel.classList.add("hidden")
      }
    })
  }
}