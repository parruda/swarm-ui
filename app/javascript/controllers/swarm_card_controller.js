import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  export(event) {
    event.preventDefault()
    const swarmId = event.currentTarget.dataset.swarmId
    
    // Create a temporary link to download the YAML
    const link = document.createElement('a')
    link.href = `/swarm_templates/${swarmId}/export.yaml`
    link.download = true
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}