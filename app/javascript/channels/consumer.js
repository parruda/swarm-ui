// Action Cable provides the framework to deal with WebSockets in Rails.
// You can generate new channels where WebSocket features live using the `bin/rails generate channel` command.

import { createConsumer } from "@rails/actioncable"

const consumer = createConsumer()

// Debug logging
console.log("ActionCable consumer created", consumer)

// Make it available globally for debugging
window.App = window.App || {}
window.App.cable = consumer

export default consumer