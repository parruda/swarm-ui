import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="flash"
export default class extends Controller {
  connect() {
    // Find all dismiss buttons in flash messages
    const dismissButtons = document.querySelectorAll('.dismiss-flash-button');

    // Add click event listener to each button
    dismissButtons.forEach(button => {
      button.addEventListener('click', this.dismiss);
    });

    // Check if we have any flash messages
    const flashMessages = document.querySelectorAll('.flash-message');
    if (flashMessages.length > 0) {
      // Automatically dismiss flash messages after 5 seconds
      setTimeout(() => {
        flashMessages.forEach(flash => {
          this.fadeOut(flash);
        });
      }, 5000);
    }
  }

  dismiss(event) {
    // Find the parent flash message and fade it out
    const flashMessage = event.target.closest('.flash-message');
    if (flashMessage) {
      this.fadeOut(flashMessage);
    }
  }

  fadeOut(element) {
    // Add transition for smoother disappearance
    element.style.transition = 'opacity 0.5s ease-out';
    element.style.opacity = '0';

    // Remove the element after transition completes
    setTimeout(() => {
      element.remove();
    }, 500);
  }
}