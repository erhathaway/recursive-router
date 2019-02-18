import { OutputLocation } from "../types";

type CacheValue = string | boolean;

/**
 * Used to manipulate the router cache
 * Cache is set when a router 'hides'
 * Depending on the router type logic, a router can use its 
 * cache when setting new state instead of a default value
 */
class Cache {
  _cacheStore?: CacheValue

  constructor() {
    this._cacheStore = undefined;
  }

  get hasCache() {
    return !!this._cacheStore;
  }

  get state() {
    return this._cacheStore;
  }

  removeCache() {
    this._cacheStore = undefined;
  }

  setCache(value: CacheValue) {
    this._cacheStore = value;
  }

  // TODO Fix this any type once Router has a type definition
  setCacheFromLocation(location: OutputLocation, routerInstance: any) {
    // dont set cache if one already exists!
    if (this.hasCache) { return; }

    let cache;
    if (routerInstance.isPathRouter) {
      cache = location.pathname[routerInstance.pathLocation];
    } else {
      cache = !!location.search[routerInstance.routeKey];
    }

    this.setCache(cache);
  }
}

export default Cache;