// js/core/ControllerRegistry.js
// Lightweight ownership boundary for long-lived app systems.
// A registered controller may expose dispose() or destroy().

export class ControllerRegistry {
  constructor() {
    this.controllers = new Map();
  }

  register(name, controller) {
    if (!name || !controller) return controller;

    const previous = this.controllers.get(name);
    if (previous && previous !== controller) {
      this.#disposeController(previous);
    }

    this.controllers.set(name, controller);
    return controller;
  }

  get(name) {
    return this.controllers.get(name) || null;
  }

  release(name, { dispose = true } = {}) {
    const controller = this.controllers.get(name);
    if (!controller) return null;

    this.controllers.delete(name);
    if (dispose) this.#disposeController(controller);
    return controller;
  }

  disposeAll() {
    for (const controller of this.controllers.values()) {
      this.#disposeController(controller);
    }
    this.controllers.clear();
  }

  #disposeController(controller) {
    try {
      if (typeof controller.dispose === "function") controller.dispose();
      else if (typeof controller.destroy === "function") controller.destroy();
    } catch (error) {
      console.warn("[ControllerRegistry] controller disposal failed", error);
    }
  }
}
