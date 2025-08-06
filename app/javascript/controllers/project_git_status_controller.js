import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { projectId: Number, projectPath: String }
  static targets = ["branch", "dirty", "ahead", "behind", "indicatorContainer"]
  
  connect() {
    // Fetch git status immediately on connect
    this.fetchGitStatus()
  }
  
  async fetchGitStatus() {
    try {
      const response = await fetch(`/projects/${this.projectIdValue}/git_status`)
      
      if (!response.ok) {
        console.error(`Failed to fetch git status for project ${this.projectIdValue}: ${response.status}`)
        return
      }
      
      const data = await response.json()
      
      if (!data.git) {
        // Not a git repository, nothing to show
        return
      }
      
      // Update branch badge
      if (this.hasBranchTarget && data.branch) {
        const branchBadge = this.branchTarget.parentElement
        this.branchTarget.textContent = data.branch
        branchBadge.classList.remove('hidden')
        branchBadge.classList.add('inline-flex')
        branchBadge.style.display = '' // Remove inline style
      }
      
      // Update dirty badge - ensure we're checking for boolean true
      if (this.hasDirtyTarget) {
        const dirtyBadge = this.dirtyTarget.parentElement
        if (data.dirty === true) {
          dirtyBadge.classList.remove('hidden')
          dirtyBadge.classList.add('inline-flex')
          dirtyBadge.style.display = '' // Remove inline style
        } else {
          dirtyBadge.classList.add('hidden')
          dirtyBadge.classList.remove('inline-flex')
          dirtyBadge.style.display = 'none'
        }
      }
      
      // Update ahead/behind indicators
      const hasAheadBehind = data.ahead > 0 || data.behind > 0
      
      if (this.hasAheadTarget) {
        const aheadContainer = this.aheadTarget.parentElement
        if (data.ahead > 0) {
          this.aheadTarget.textContent = `${data.ahead} ahead`
          aheadContainer.classList.remove('hidden')
          aheadContainer.classList.add('inline-flex')
          aheadContainer.style.display = ''
        } else {
          aheadContainer.classList.add('hidden')
          aheadContainer.classList.remove('inline-flex')
          aheadContainer.style.display = 'none'
        }
      }
      
      if (this.hasBehindTarget) {
        const behindContainer = this.behindTarget.parentElement
        if (data.behind > 0) {
          this.behindTarget.textContent = `${data.behind} behind`
          behindContainer.classList.remove('hidden')
          behindContainer.classList.add('inline-flex')
          behindContainer.style.display = ''
          // If we have ahead too, ensure ml-2 is present
          if (data.ahead > 0) {
            behindContainer.classList.add('ml-2')
          } else {
            behindContainer.classList.remove('ml-2')
          }
        } else {
          behindContainer.classList.add('hidden')
          behindContainer.classList.remove('inline-flex')
          behindContainer.style.display = 'none'
        }
      }
      
      // If no ahead/behind data, we could optionally show a placeholder
      // The container always stays visible to prevent layout shift
      if (this.hasIndicatorContainerTarget && !hasAheadBehind) {
        // Add a non-breaking space to maintain minimum height if completely empty
        if (this.indicatorContainerTarget.textContent.trim() === '') {
          this.indicatorContainerTarget.innerHTML = '&nbsp;'
        }
      }
      
    } catch (error) {
      console.error('Failed to fetch git status:', error)
      // Silently fail - just don't show git status
    }
  }
}