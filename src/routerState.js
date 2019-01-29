// export const defaultStore = {};

export default class DefaultRoutersStateAdapter {
  constructor(store, config = { historySize: 2 }) {
    this.store = store || {};
    this.config = config;
    this.observers = {}; // key is routerName
  }

  setState(desiredRouterStates) {
    const routerNames = Object.keys(desiredRouterStates);
    const hasUpdatedTracker = [];

    this.store = routerNames.reduce((routerStates, routerName) => {
      // extract current and historical states
      const { current, historical } = routerStates[routerName] || { current: {}, historical: [] };
      // skip routers who haven't been updated
      if (desiredRouterStates[routerName] === current) { return routerStates; }

      // clone historical states
      let newHistorical = historical.slice();
      // add current to historical states
      newHistorical.unshift(current);
      // enforce history size
      if (newHistorical.length > this.config.historySize) { newHistorical = newHistorical.slice(0, this.config.historySize); }
      // update state to include new router state
      routerStates[routerName] = { current: desiredRouterStates[routerName], historical: newHistorical }

      // record which routers have had a state change
      hasUpdatedTracker.push(routerName);

      return routerStates;
    }, Object.assign(this.getState()));

    // call observers of all routers that have had state changes
    
    hasUpdatedTracker.forEach((routerName) => {
      const observers = this.observers[routerName] || []
      if (Array.isArray(observers)) {
        observers.forEach(fn => fn(this.store[routerName]));
      }
    });
  }

  createRouterStateGetter(routerName) {
    return () => {
      return this.store[routerName];
    };
  }

  createRouterStateSubscriber(routerName) {
    return (fn) => {
      if (Array.isArray(this.observers[routerName])) {
        this.observers[routerName].push(fn)
      } else {
        this.observers[routerName] = [fn]
      }
    }
  }

  getState() { return this.store; }
}
