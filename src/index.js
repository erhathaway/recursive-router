import { observable } from "mobx"

import {
  extractScene,
  extractFeature,
  extractStack,
  extractData,
} from './extractLocation';

import setLocation from './setLocation';
import registerRouter from './registerRouter';
import buildInitalizeRouterFn from './initalizeRouter';

const routeKeys = [];

// const randomKey = (keySize = 1) => {
//   const N = keySize;
//   return Array(N+1).join((Math.random().toString(36)+'00000000000000000').slice(2, 18)).slice(0, N)
// }
//
// const createUniqueKey = (keySize = 1) => {
//   let key;
//   const duplicateKey = () => routeKeys.includes(key) && key
//
//   while (!key || duplicateKey()) {
//     key = randomKey(keySize)
//   }
//   routeKeys.push(key)
//   return key;
// }

class Router {
  @observable visible = undefined;
  @observable order = undefined;
  @observable history = { at: undefined, from: undefined };
  @observable state = {};

  _routers = {};

  _hooks = {
    before: [],
    after: []
  };

  _parent = undefined;
  _type = undefined;

  _isPathRouter = undefined;
  _rehydrateChildRoutersState = undefined; // undefined so it can be explicitly set to true or false to override parent settings

  static searchString() {
    return window.location.search || '';
  }

  static pathnameString() {
    return window.location.pathname || '';
  }

  static location() {
    return { pathname: Router.pathnameString(), search: Router.searchString() }
  }

  static capitalize(string = '') {
    return string.charAt(0).toUpperCase() + string.slice(1)
  }

  constructor(config = { routeKey: undefined }) {
    const { name, routeKey, routers, hooks, visible, order, isPathRouter, state, rehydrateChildRoutersState } = config;

    this.visible = visible || false;
    this.order = order;
    this.name = name;
    this.routeKey = routeKey ? routeKey.trim() : this.name.trim(); //createUniqueKey();
    this._isPathRouter = isPathRouter;
    this._rehydrateChildRoutersState = rehydrateChildRoutersState;
    if (hooks) this.hooks = hooks;
    if (routers) this.routers = routers;

    if (state && typeof state === 'object') {
      this.state = state;
    } else if (state) {
      throw 'The initial state object passed to a router constructor must be an object';
    }

    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.bringToFront = this.bringToFront.bind(this);
    this.sendToBack = this.sendToBack.bind(this);
    this.moveForward = this.moveForward.bind(this);
    this.moveBackward = this.moveBackward.bind(this);
  }

  set parent(parentRouter) {
    this._parent = parentRouter;
  }

  get parent() { return this._parent };

  set type(routerType) {
    this._type = routerType;
  }

  get type() { return this._type };

  set routers(routers = {}) {
    this._routers = { ...this.routers, ...routers };

    const routerTypes = Object.keys(this.routers);
    routerTypes.forEach(type => {
      this.routers[type].forEach(r => {
        r.parent = this;
        r.type = type;
      });
    })
  }

  get routers() { return this._routers; }

  set hooks(hooks = {}) {
    this._hooks = { ...this.hooks, ...hooks };
  }

  get hooks() { return this._hooks; }

  get isPathRouter() {
    if (this.name === 'root') return true;
    // if this router was explicitly set to be a path router
    if (this._isPathRouter && this.parent.isPathRouter) { return true; }
    else if (this._isPathRouter) {
      throw `${this.type} router: ${this.name} is explicitly set to modify the pathname
        but one of its parent routers doesnt have this permission.
        Make sure all parents have 'isPathRouter' attribute set to 'true' in the router config OR
        Make sure all parents are of router type 'scene' or 'data'.
        If the routers parents have siblings of both 'scene' and 'data' the 'scene' router will always be used for the pathname
      `
    }

    if (this.type === 'scene' && this.parent.isPathRouter) {
      // check to make sure sibling data routers arent explicitly set to modify the pathname
      const siblingRouters = Object.keys(this.parent.routers['data'] || {});
      const isSiblingRouterExplictlyAPathRouter = siblingRouters.reduce((acc, r) => {
        // check all data router siblings and make sure none have been explicitly set to be a path router
        const childRouter =  this.parent.routers['data'][r];
        return acc || childRouter._isPathRouter === true;
      }, false)

      if (isSiblingRouterExplictlyAPathRouter === false) return true;
    } else if (this.type === 'data' && this.parent.isPathRouter) {
      if (this._isPathRouter === false) return false;
      // check to make sure sibling scene routers aren't present
      const siblingRouters = Object.keys(this.parent.routers['scene'] || {});

      if (siblingRouters.length === 0) return true;
    }

    return false;
  }

  get routerLevel() {
    if (this.name === 'root') return 0;
    return 1 + this.parent.routerLevel;
  }


  updateLocationViaMethod(location, methodNamePrefix) {
    const methodName = `${methodNamePrefix}${Router.capitalize(this.type)}`;
    if (methodName === methodNamePrefix) {
      throw `router type attribute is undefined for router with name: ${this.name}`;
    }

    try {
      // an object with { pathname, search }
      // where pathname is a string
      // and search is an object of routeKeys belonging to a routerType and their value (usually boolean | int)
      const newLocation = this[methodName](location);
      return newLocation;
      // setLocation(newLocation, location);
    } catch (e) {
      if (e.message === 'this[methodName] is not a function') {
        throw `#${methodNamePrefix} method is not implemented for router type: ${this.type}`;
      } else {
        throw e;
      }
    }
  }

  // get hasHistory() {
  //   return true
  // }

  get hasDefault() {
    return true
  }

  isDescendentOf(parentKey) {
    if (this.parent) {
      return this.routeKey === parentKey || this.parent.isDescendentOf(parentKey);
    } else {
      return this.routeKey === parentKey;
    }
  }

  rollBackToMostRecentState(existingLocation) {
    if (!this.history || !this.history.from) return existingLocation;
    const historicalRouteValue = this.history.from[this.routeKey];
    // const pathname = { ...existingLocation.pathname, ...oldPathname };
    // const pathname = existingLocation.pathname;
    let pathname;
    let search;
    if (this.isPathRouter) {
      const splitPath = existingLocation.pathname.split('/');
      // const presentRouter = splitPath[this.routerLevel];
      if (this.type === 'data' && historicalRouteValue != null) {
        splitPath[this.routerLevel] = historicalRouteValue;
      } else if (historicalRouteValue) {
        splitPath[this.routerLevel] = this.routeKey;
      }
      pathname = splitPath.join('/');
      search = existingLocation.search;
    } else {
      pathname = existingLocation.pathname;
      search = { ...existingLocation.search, [this.routeKey]: historicalRouteValue };
    }

    // const search = { ...existingLocation.search, ...oldSearch };
    if (this.name === 'oScene') console.log('rolling back', pathname, search, historicalRouteValue)
    return { pathname, search };
  }

  useDefault(location) {
    return location;
  }

  // repopulate tree state
  updateLocationFnShow(newLocation, router, ctx) {
    if (router.routeKey === ctx.originRouteKey) { return router.show(false, newLocation); }
    if (router.isDescendentOf(ctx.originRouteKey)) {
      if ((router._rehydrateChildRoutersState !== false) && (router._rehydrateChildRoutersState || ctx.rehydrateChildRoutersState)) {
        return router.rollBackToMostRecentState(newLocation)
      } else if (router.hasDefault){
        return router.useDefault(newLocation)
      }
    }
    return newLocation;
  }

  // fold a fn over a node and all its child nodes
  reduceStateTree(location, router, fn, ctx) {
      const newLocation = fn(location, router, ctx);
      const childRouterTypes = Object.keys(router.routers || {});
      return childRouterTypes.reduce((locationA, type) => {
        return router.routers[type].reduce((locationB, childRouter) => {
          const newCtx = { ...ctx, rehydrateChildRoutersState: childRouter.rehydrateChildRoutersState || ctx.rehydrateChildRoutersState }
          return this.reduceStateTree(locationB, childRouter, fn, newCtx);
        }, locationA);
      }, newLocation);
  }

  // all routers implement this method
  show(isOriginalCall = true, existingLocation) {
    const METHOD_NAME_PREFIX = 'show';
    const location = existingLocation ? existingLocation : Router.location();
    // const newLocation = this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    if (isOriginalCall && !this.visible) {
      const ctx = {
        originRouteKey: this.routeKey,
        rehydrateChildRoutersState: this._rehydrateChildRoutersState
      };
      // console.log('ctx', ctx)
      const newLocation = this.reduceStateTree(location, this, this.updateLocationFnShow, ctx);
      setLocation(newLocation, location);
    } else {
      const newLocation = this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
      return newLocation
    }
  }

  // all routers implement this method
  hide() {
    const METHOD_NAME_PREFIX = 'hide';
    const location = Router.location();
    // this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    const newLocation = this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    setLocation(newLocation, location);
  }

  // only stack router implements this method
  moveForward() {
    const METHOD_NAME_PREFIX = 'moveForward';
    const location = Router.location();
    // this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    const newLocation = this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    setLocation(newLocation, location);
  }

  // only stack router implements this method
  moveBackward() {
    const METHOD_NAME_PREFIX = 'moveBackward';
    const location = Router.location();
    // this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    const newLocation = this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    setLocation(newLocation, location);
  }

  // only stack router implements this method
  bringToFront() {
    const METHOD_NAME_PREFIX = 'bringToFront';
    const location = Router.location();
    // this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    const newLocation = this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    setLocation(newLocation, location);
  }

  // only stack router implements this method
  sendToBack() {
    const METHOD_NAME_PREFIX = 'sendToBack';
    const location = Router.location();
    // this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    const newLocation = this.updateLocationViaMethod(location, METHOD_NAME_PREFIX);
    setLocation(newLocation, location);
  }

  /* -------------------------------------
  ROUTER SPECIFIC METHODS FOR LOCATION UPDATING
  ----------------------------------------*/

  /* SCENE SPECIFIC */
  showScene(location) {
    const search = {};
    if (this.parent) {
      this.parent.routers[this.type].forEach(r => search[r.routeKey] = undefined);
    }

    if (this.isPathRouter) {
      // dont update pathname if parent isn't visible
      if (!this.parent.visible) return { search }

      // const childScenes = this.routers['scene'];


      // hide state tree
      // const updateLocationFn = (newLocation, router) => {
      //   if (router.name === 'view') { return router.show(newLocation); }
      //   if (router.isDescendentOf('view')) {
      //     if (router.hideWithParent) {
      //       return router.hide(newLocation)
      //     }
      //   }
      //   return newLocation;
      // }
      //
      //
      // // an update should reduce over the child branches starting at the node called
      // // it should return a new location object that can be used to update the URL
      // const newLocation = routerTree.reduce((newLocation, routerState) => {
      //   return updateLocationFn(newLocation);
      // }, existingLocation)
      // if (childScenes && childScenes[0]) {
      //   const childHistory = childScenes[0].history.from || {};
      //   const keys = Object.keys(childHistory);
      //   const lastVisibleChildScene = keys.find(k => childHistory[k] === true);
      //
      //   if (lastVisibleChildScene) {
      //     console.log('childrouters', childScenes)
      //     const router = childScenes.find(r => r.routeKey === lastVisibleChildScene)
      //     console.log('found router', router)
      //     // if (router) setTimeout( () => router.show(), 1000);
      //   }
      //   console.log('last visible child scene', lastVisibleChildScene)
      // }
      const pathNameArr = location.pathname.split('/');
      pathNameArr[this.routerLevel] = this.routeKey;
      const pathname = pathNameArr.join('/');

      return { pathname, search }
    } else {
      search[this.routeKey] = true;
      return { search };
    }
  }

  hideScene(location) {
    const search = {};
    if (this.parent) {
      this.parent.routers[this.type].forEach(r => search[r.routeKey] = undefined);
    }

    if (this.isPathRouter) {
      const pathNameArr = location.pathname.split('/');

      const newArr = pathNameArr.slice(0, this.routerLevel);

      const tempPathname = newArr.join('/');
      const pathname = tempPathname === '' ? '/' : tempPathname;

      return { pathname, search }
    } else {
      return { search };
    }
  }

  /* STACK SPECIFIC */
  // takes an object of keys where the value's represent order and turns it into an array of ordered keys
  orderStackRouteKeys(routeKeyOrderObj) {
    /*
      { <routeKeyName>: <order> }
    */

    // reduce the order object to the array of sorted keys
    const routerRouteKeys = Object.keys(routeKeyOrderObj);
    /* reorder routeKeyOrderObj by order
      ex: { <order>: <routeKeyName> }
    */
    const orderAsKey = routerRouteKeys.reduce((acc, key) => {
      const value = routeKeyOrderObj[key]
      if (value != null && !isNaN(value)) {
        acc[routeKeyOrderObj[key]] = key;
      }
      return acc;
    }, {});

    const orders = Object.values(routeKeyOrderObj);
    const sortedOrders =  orders.sort((a, b) => a - b).filter(n => n != null && !isNaN(n));
    const sortedKeys = sortedOrders.map(order => orderAsKey[order]);
    return sortedKeys;
  }

  showStack(location) {
    // get routeKeys that belong to this router type
    const typeRouterRouteKeys = this.parent.routers[this.type].map(t => t.routeKey);
    // get current order for all routeKeys via the location state
    const routerTypeData = extractStack(location, typeRouterRouteKeys);
    const sortedKeys = this.orderStackRouteKeys(routerTypeData);


    // find index of this routers routeKey
    const index = sortedKeys.indexOf(this.routeKey);
    if (index > -1) {
      // remove routeKey if it exists
      sortedKeys.splice(index, 1);
    }
    // add route key to front of sorted keys
    sortedKeys.unshift(this.routeKey);

    // create router type data obj
    const search = sortedKeys.reduce((acc, key, i) => {
      acc[key] = i + 1;
      return acc;
    }, {})

    return { search };
  }

  hideStack(location) {
    // get routeKeys that belong to this router type
    const typeRouterRouteKeys = this.parent.routers[this.type].map(t => t.routeKey);
    // get current order for all routeKeys via the location state
    const routerTypeData = extractStack(location, typeRouterRouteKeys);
    const sortedKeys = this.orderStackRouteKeys(routerTypeData);

    // find index of this routers routeKey
    const index = sortedKeys.indexOf(this.routeKey);
    if (index > -1) {
      // remove routeKey if it exists
      sortedKeys.splice(index, 1);
    }

    // create router type data obj
    const search = sortedKeys.reduce((acc, key, i) => {
      acc[key] = i + 1;
      return acc;
    }, {})
    // remove this routeKey from the router type search
    search[this.routeKey] = undefined;
    return { search };
  }

  moveForwardStack(location) {
    // get routeKeys that belong to this router type
    const typeRouterRouteKeys = this.parent.routers[this.type].map(t => t.routeKey);
    // get current order for all routeKeys via the location state
    const routerTypeData = extractStack(location, typeRouterRouteKeys);
    const sortedKeys = this.orderStackRouteKeys(routerTypeData);


    // find index of this routers routeKey
    const index = sortedKeys.indexOf(this.routeKey);
    if (index > -1) {
      // remove routeKey if it exists
      sortedKeys.splice(index, 1);
    }

    // move routeKey router forward by one in the ordered routeKey list
    const newIndex = index >= 1 ? index - 1 : 0;
    sortedKeys.splice(newIndex, 0, this.routeKey);

    // create router type data obj
    const search = sortedKeys.reduce((acc, key, i) => {
      acc[key] = i + 1;
      return acc;
    }, {})

    return { search };
  }

  moveBackwardStack(location) {
    // get routeKeys that belong to this router type
    const typeRouterRouteKeys = this.parent.routers[this.type].map(t => t.routeKey);
    // get current order for all routeKeys via the location state
    const routerTypeData = extractStack(location, typeRouterRouteKeys);
    const sortedKeys = this.orderStackRouteKeys(routerTypeData);


    // find index of this routers routeKey
    const index = sortedKeys.indexOf(this.routeKey);
    if (index > -1) {
      // remove routeKey if it exists
      sortedKeys.splice(index, 1);
    }

    // move routeKey router backward by one in the ordered routeKey list
    const newIndex = index + 1;
    sortedKeys.splice(newIndex, 0, this.routeKey);

    // create router type data obj
    const search = sortedKeys.reduce((acc, key, i) => {
      acc[key] = i + 1;
      return acc;
    }, {});

    return { search };
  }

  bringToFrontStack(location) {
    return this.showStack(location);
  }

  sendToBackStack(location) {
    // get routeKeys that belong to this router type
    const typeRouterRouteKeys = this.parent.routers[this.type].map(t => t.routeKey);
    // get current order for all routeKeys via the location state
    const routerTypeData = extractStack(location, typeRouterRouteKeys);
    const sortedKeys = this.orderStackRouteKeys(routerTypeData);

    // find index of this routers routeKey
    const index = sortedKeys.indexOf(this.routeKey);
    if (index > -1) {
      // remove routeKey if it exists
      sortedKeys.splice(index, 1);
    }

    // add to back of stack
    sortedKeys.push(this.routeKey);

    // create router type data obj
    const search = sortedKeys.reduce((acc, key, i) => {
      acc[key] = i + 1;
      return acc;
    }, {});

    return { search };
  }

  /* FEATURE ROUTER SPECIFIC */
  showFeature() {
    const search = { [this.routeKey]: true };
    return { search };
  }

  hideFeature() {
    const search = { [this.routeKey]: undefined };
    return { search };
  }

  /* DATA ROUTER SPECIFIC */
  showData() {
    const search = {};

    if (this.isPathRouter) {
      // dont update pathname if parent isn't visible
      if (!this.parent.visible) return { search }

      const pathNameArr = location.pathname.split('/');
      pathNameArr[this.routerLevel] = this.state.data;
      const pathname = pathNameArr.join('/');

      return { pathname, search }
    } else {
      const search = { [this.routeKey]: this.state ? this.state.data : undefined };
      return { search };
    }
  }

  hideData() {
    const search = { [this.routeKey]: undefined };

    if (this.isPathRouter) {
      const pathNameArr = location.pathname.split('/');

      const newArr = pathNameArr.slice(0, this.routerLevel);

      const tempPathname = newArr.join('/');
      const pathname = tempPathname === '' ? '/' : tempPathname;

      return { pathname, search }
    } else {
      return { search };
    }
  }

  setData(data) {
    this.state.data = data;
    this.show();
  }

  _update(newLocation) {
    let location = newLocation;
    let context = { visible: this.visible, order: this.order, history: this.history};
    // this.hooks.before.forEach(hook => hook(location, context));

    const routerTypes = Object.keys(this.routers);
    routerTypes.forEach(type => {
      // pass new location to child routers
      const routers = this.routers[type];
      if (Array.isArray(routers)) {
        // add all routeKeys that belong to this router type
        const contextWithRouterKeys = { ...context, routeKeys: routers.map(t => t.routeKey) };
        routers.forEach(r => {
          try {
            // get new state for specific router
            const newRouterState = r[`update${Router.capitalize(type)}`](r.state, contextWithRouterKeys, location);
            if (newRouterState) r._setState(newRouterState);
            if (r && r._update) r._update();

          } catch (e) {
            if (e.message === '_this[("update" + Router.capitalize(...))] is not a function') {
              throw `Missing update function "update${Router.capitalize(type)}" for router type ${type}`;
            } else {
              throw e;
            }
          }
        });
      } else {
        throw 'Routers must be passed to a router type as an Array ex: { stack: [{ name: "Im a stack router" }, { name: "Stack2" }]}';
      }
    })

    this.hooks.after.forEach(hook => hook(location, context));
  }

  _setState(state = {}) {
    const { visible, at, order, data, ...otherState } = state;
    if (at) {
      this.history.from = this.history.at;
      this.history.at = at;
    }
    this.order = order ? order : undefined;
    this.visible = visible ? visible : false;
    this.data = data ? state : undefined;

    this.state = { ...this.state, ...state };
  }

  updateStack(parentState, parentContext, newLocation) {
    const routerTypeData = extractStack(location, parentContext.routeKeys);
    const order = routerTypeData[this.routeKey];

    return {
      visible: order != null ? true : false,
      order,
      at: routerTypeData,
    }
  }

  updateScene(parentState, parentContext, newLocation) {
    const routerTypeData = extractScene(location, parentContext.routeKeys, this.isPathRouter, this.routerLevel);
    const visible = routerTypeData[this.routeKey];
    if (this.name === 'oScene') console.log(this.name, visible, this.visible)

    // if ( JSON.stringify(this.history.at) === JSON.stringify(routerTypeData)) return undefined;

    return {
      visible,
      order: undefined,
      at: routerTypeData,
    }
  }

  updateFeature(parentState, parentContext, newLocation) {
    const routerTypeData = extractFeature(location, parentContext.routeKeys);
    const visible = routerTypeData[this.routeKey];

    return {
      visible,
      order: undefined,
      at: routerTypeData,
    }
  }

  updateData(parentState, parentContext, newLocation) {
    const routerTypeData = extractData(location, parentContext.routeKeys, this.isPathRouter, this.routerLevel, this);
    const visible = Object.values(routerTypeData).filter(i => i != null).length > 0;

    return {
      visible,
      order: undefined,
      at: routerTypeData,
    }
  }
}



const initalizeRouter = buildInitalizeRouterFn(Router);

export { Router as default, initalizeRouter, registerRouter }
