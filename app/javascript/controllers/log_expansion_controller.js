import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["entry", "expandButton", "collapseButton", "content", "truncated", "full"]
  static values = { expanded: Boolean }

  connect() {
    // Initialize all entries as collapsed
    this.entryTargets.forEach(entry => {
      entry.dataset.expanded = "false"
    })
  }

  toggleEntry(event) {
    // Prevent event bubbling if clicking on a button or link
    if (event.target.tagName === 'BUTTON' || event.target.tagName === 'A') {
      return
    }

    const entry = event.currentTarget
    const isExpanded = entry.dataset.expanded === "true"
    
    entry.dataset.expanded = (!isExpanded).toString()
    
    // Find the truncated and full content within this entry
    const truncated = entry.querySelector('[data-log-expansion-target="truncated"]')
    const full = entry.querySelector('[data-log-expansion-target="full"]')
    const chevron = entry.querySelector('[data-log-expansion-target="chevron"]')
    
    if (truncated && full) {
      if (isExpanded) {
        // Collapse
        truncated.classList.remove("hidden")
        full.classList.add("hidden")
        if (chevron) chevron.classList.remove("rotate-90")
      } else {
        // Expand
        truncated.classList.add("hidden")
        full.classList.remove("hidden")
        if (chevron) chevron.classList.add("rotate-90")
      }
    }
  }

  expandAll() {
    this.entryTargets.forEach(entry => {
      entry.dataset.expanded = "true"
      const truncated = entry.querySelector('[data-log-expansion-target="truncated"]')
      const full = entry.querySelector('[data-log-expansion-target="full"]')
      const chevron = entry.querySelector('[data-log-expansion-target="chevron"]')
      
      if (truncated && full) {
        truncated.classList.add("hidden")
        full.classList.remove("hidden")
        if (chevron) chevron.classList.add("rotate-90")
      }
    })
    
    this.updateToggleButton(true)
  }

  collapseAll() {
    this.entryTargets.forEach(entry => {
      entry.dataset.expanded = "false"
      const truncated = entry.querySelector('[data-log-expansion-target="truncated"]')
      const full = entry.querySelector('[data-log-expansion-target="full"]')
      const chevron = entry.querySelector('[data-log-expansion-target="chevron"]')
      
      if (truncated && full) {
        truncated.classList.remove("hidden")
        full.classList.add("hidden")
        if (chevron) chevron.classList.remove("rotate-90")
      }
    })
    
    this.updateToggleButton(false)
  }

  toggleAll() {
    const hasExpanded = this.entryTargets.some(entry => entry.dataset.expanded === "true")
    
    if (hasExpanded) {
      this.collapseAll()
    } else {
      this.expandAll()
    }
  }

  updateToggleButton(allExpanded) {
    if (this.hasExpandButtonTarget && this.hasCollapseButtonTarget) {
      if (allExpanded) {
        this.expandButtonTarget.classList.add("hidden")
        this.collapseButtonTarget.classList.remove("hidden")
      } else {
        this.expandButtonTarget.classList.remove("hidden")
        this.collapseButtonTarget.classList.add("hidden")
      }
    }
  }

  copyContent(event) {
    event.stopPropagation() // Prevent triggering the expand/collapse
    
    const button = event.currentTarget
    const entry = button.closest('[data-log-expansion-target="entry"]')
    const fullContent = entry.querySelector('[data-log-expansion-target="full"]')
    const truncatedContent = entry.querySelector('[data-log-expansion-target="truncated"]')
    
    // Get the content - if there's no full content, it means the entry wasn't truncated
    const contentElement = fullContent || truncatedContent || entry.querySelector('.text-slate-300, .text-slate-400, .text-slate-500')
    
    if (contentElement) {
      const text = contentElement.textContent.trim()
      navigator.clipboard.writeText(text).then(() => {
        // Show feedback by changing the icon temporarily
        const originalIcon = button.querySelector('svg').cloneNode(true)
        button.classList.add("text-emerald-400")
        
        // Note: Since we can't dynamically create heroicons in JS, we'll just change the color
        // The checkmark feedback will be shown through the color change
        
        setTimeout(() => {
          button.classList.remove("text-emerald-400")
        }, 2000)
      })
    }
  }
}