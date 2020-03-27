import defaultRouterTemplates from './router_templates';

import {BrowserSerializedStore, NativeSerializedStore} from './serialized_state';
import {TracerSession} from './tracer';
import {IManager} from './types/manager';
import {
    ActionWraperFnDecorator,
    IInputLocation,
    ILocationActionContext,
    IRouterCreationInfo,
    IRouterConfig,
    IRouterDeclaration,
    IRouterInitArgs,
    NarrowRouterTypeName,
    Root,
    ManagerRouterTypes,
    IManagerInit,
    RouterClass,
    IRouterTemplates,
    Constructable,
    RouterInstance,
    AllTemplates,
    RouterCurrentStateFromTemplates,
    ExtractCustomStateFromTemplate,
    RouterReducerFn,
    IRouterActionOptions,
    DefaultRouterActions,
    RouterTemplateUnion
} from './types';

import DefaultRouter from './router_base';
import DefaultRouterStateStore from './all_router_state';
import {objKeys} from './utilities';
import createActionExecutor from './action_executor';
import {IRouterCache} from './types/router_cache';
import DefaultRouterCache from './all_router_cache';

// extend router base for specific type
const createRouterFromTemplate = <
    CustomTemplates extends IRouterTemplates<unknown>,
    RouterTypeName extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>,
    // TODO figure out why RouterClass can't be used here instead.
    // It has a similar but more specific signature.
    RC extends Constructable = Constructable
>(
    templateName: RouterTypeName,
    template: AllTemplates<CustomTemplates>[RouterTypeName],
    BaseRouter: RC,
    actionFnDecorator?: ActionWraperFnDecorator,
    actionExecutorOptions?: {printerTracerResults?: boolean}
): RouterClass<AllTemplates<CustomTemplates>, RouterTypeName, IManager<CustomTemplates>> => {
    // TODO figure out why actions are 'default router actions' type
    const {actions, reducer} = template;

    const MixedInClass = class extends BaseRouter {
        // change the router name to include the type
        // constructor.name = `${capitalize(templateName.toString())}Router`;

        // eslint-disable-next-line
        constructor(...args: any[]) {
            super(...args);
            // add actions to RouterType
            objKeys(actions).forEach(actionName => {
                Object.assign(this, {
                    [actionName]: createActionExecutor(
                        actions[actionName],
                        actionName as string,
                        actionFnDecorator,
                        actionExecutorOptions
                    )
                });
            });

            // add reducer to RouterType
            Object.assign(this, {
                reducer
            });
        }
    };
    return (MixedInClass as unknown) as RouterClass<
        AllTemplates<CustomTemplates>,
        RouterTypeName,
        IManager<CustomTemplates>
    >;
};

// implements IManager<CustomTemplates>
export default class Manager<CustomTemplates extends IRouterTemplates<unknown> = {}> {
    public printTracerResults: boolean;
    public actionFnDecorator?: ActionWraperFnDecorator;
    public tracerSession: TracerSession;
    public _routers: Record<string, RouterInstance<AllTemplates<CustomTemplates>>>;
    public rootRouter: Root<AllTemplates<CustomTemplates>>;
    public serializedStateStore: IManagerInit<CustomTemplates>['serializedStateStore'];
    public routerStateStore: IManagerInit<CustomTemplates>['routerStateStore'];
    public routerTypes: ManagerRouterTypes<
        AllTemplates<CustomTemplates>,
        IManager<CustomTemplates>
    >;

    public templates: AllTemplates<CustomTemplates>;
    public routerCache: IRouterCache<
        ExtractCustomStateFromTemplate<RouterTemplateUnion<AllTemplates<CustomTemplates>>>
    >;

    public actionCount: number;

    public cacheKey: string;
    public removeCacheAfterRehydration: boolean;

    constructor(
        initArgs: IManagerInit<CustomTemplates> = {},
        {
            shouldInitialize,
            actionFnDecorator
        }: {shouldInitialize: boolean; actionFnDecorator?: ActionWraperFnDecorator} = {
            shouldInitialize: true
        }
    ) {
        // used by mobx to decorate action fn
        if (actionFnDecorator) {
            this.actionFnDecorator = actionFnDecorator;
        }
        // pass all initArgs to this method so mobx decoration can work
        shouldInitialize && this.initializeManager(initArgs);
    }

    /**
     * Method to increment number of router actions that have ocurred over
     * the course of the manager session.
     *
     * Router history is scoped to an action count number. This provides an easy way for
     * an individual router to know how its history relates to its siblings.
     */
    public incrementActionCount(): void {
        this.actionCount = this.actionCount + 1;
    }

    public initializeManager({
        routerTree,
        serializedStateStore,
        routerStateStore,
        router,
        customTemplates,
        routerCacheClass,
        printTraceResults,
        cacheKey,
        removeCacheAfterRehydration
    }: // defaultTemplates
    IManagerInit<CustomTemplates>): void {
        this.printTracerResults = printTraceResults || false;
        this.cacheKey = cacheKey || '__cache';
        this.removeCacheAfterRehydration = removeCacheAfterRehydration || true;
        this.routerStateStore =
            routerStateStore ||
            new DefaultRouterStateStore<RouterCurrentStateFromTemplates<CustomTemplates>>();

        // check if window
        if (typeof window === 'undefined') {
            this.serializedStateStore = serializedStateStore || new NativeSerializedStore();
        } else {
            this.serializedStateStore = serializedStateStore || new BrowserSerializedStore();
        }

        if (routerCacheClass) {
            this.routerCache = new routerCacheClass();
        } else {
            this.routerCache = new DefaultRouterCache();
        }

        // router types
        this.templates = ({
            ...defaultRouterTemplates,
            ...customTemplates
        } as unknown) as AllTemplates<CustomTemplates>;

        // TODO implement
        // Manager.validateTemplates(templates);
        // validate all template names are unique
        // validation should make sure action names dont collide with any Router method names

        const BaseRouter = router || DefaultRouter;
        this.routerTypes = objKeys(this.templates).reduce((acc, templateName) => {
            // fetch template
            const selectedTemplate = this.templates[templateName];
            // get function used to wrape actions
            // const createActionExecutor = this.createActionExecutor;
            // create router class from the template
            const RouterFromTemplate = createRouterFromTemplate(
                templateName as NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>,
                selectedTemplate as AllTemplates<CustomTemplates>[NarrowRouterTypeName<
                    keyof AllTemplates<CustomTemplates>
                >],
                BaseRouter,
                this.actionFnDecorator,
                {printerTracerResults: this.printTracerResults}
            );

            // add new Router type to accumulator
            acc[templateName] = RouterFromTemplate;

            return acc;
        }, {} as ManagerRouterTypes<AllTemplates<CustomTemplates>, IManager<CustomTemplates>>);

        // add initial routers
        this._routers = {};
        this.addRouters(routerTree);

        // subscribe to URL changes and update the router state when this happens
        // the subject will notify the observer of its existing state
        this.serializedStateStore.subscribeToStateChanges(this.setNewRouterState.bind(this));

        // if there is a root router show it
        if (this.rootRouter) {
            // replace location so the location at startup is a merge of the
            // existing location and default router actions
            this.rootRouter.show({replaceLocation: true});
        }
    }

    get routers(): Record<string, RouterInstance<AllTemplates<CustomTemplates>>> {
        return this._routers || {};
    }

    public linkTo = (
        routerName: string,
        actionName: string,
        actionArgs: Omit<IRouterActionOptions, 'dryRun'>
    ): string => {
        const router = this.routers[routerName];
        if (!router) {
            throw new Error(`${routerName} router not found. Could not generate link`);
        }
        if (!actionName) {
            throw new Error(
                `actionName must be supplied. Use either 'show', 'hide' or a name custom to the router`
            );
        }
        // TODO change from default router actions to union of actual actions
        const locationObj = router[actionName as keyof DefaultRouterActions]({
            ...actionArgs,
            dryRun: true
        });

        return this.serializedStateStore.serializer(locationObj).location;
    };

    /**
     * Adds the initial routers defined during initialization
     */
    public addRouters = (
        router: IRouterDeclaration<AllTemplates<CustomTemplates>> = null,
        type: NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>> = null,
        parentName: string = null
    ): void => {
        // If no router specified, there are no routers to add
        if (!router) {
            return;
        }

        // The type is derived by the relationship with the parent.
        //   Or has none, as is the case with the root router in essence
        //   Below, we are deriving the type and calling the add function recursively by type
        this.addRouter({...router, type, parentName});
        const childRouters = router.routers || {};
        objKeys(childRouters).forEach(childType => {
            childRouters[childType].forEach(child =>
                this.addRouters(
                    child,
                    childType as NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>,
                    router.name
                )
            );
        });
    };

    /**
     * High level method for adding a router to the router state tree based on an input router declaration object
     *
     * This method will add the router to the manager and correctly associate the router with
     * its parent and any child routers
     */
    public addRouter(routerDeclaration: IRouterDeclaration<AllTemplates<CustomTemplates>>): void {
        const {name, parentName, type} = routerDeclaration;
        const parent = this.routers[parentName];

        // Set the root router type if the router has no parent
        const routerType = (!parentName && !this.rootRouter
            ? 'root'
            : type) as NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>;
        const config = this.createRouterConfigArgs(routerDeclaration, routerType, parent); //as IRouterConfig; // TODO figure out why this assertion is necessary

        // Create a router
        const router = this.createRouter({name, config, type: routerType, parentName});

        // Set the created router as the parent router
        // if it has no parent and there is not yet a root
        if (!parentName && !this.rootRouter) {
            // Narrow router type to the root router type
            this.rootRouter = router as Root<AllTemplates<CustomTemplates>>;
        } else if (!parentName && this.rootRouter) {
            throw new Error(
                'Root router already exists. You likely forgot to specify a parentName'
            );
        }

        if (parent) {
            // Fetch the parent, and assign a ref of it to this router
            router.parent = parent;

            // Add ref of new router to the parent
            const siblingTypes = parent.routers[type] || [];
            siblingTypes.push(router);
            parent.routers[type] = siblingTypes;
        }

        // Add ref of new router to manager
        this.registerRouter(name, router);

        if (router.isPathRouter) {
            this.validateNeighborsOfOtherTypesArentPathRouters(router);
        }
    }

    /**
     * Remove a router from the routing tree and manager
     * Removing a router will also remove all of its children
     */
    public removeRouter = (name: string): void => {
        const router = this.routers[name];
        const {parent, routers, type} = router;

        // Delete ref the parent (if any) stores
        if (parent) {
            const routersToKeep = parent.routers[type].filter(child => child.name !== name);
            parent.routers[type] = routersToKeep;
        }

        // Recursively call this method for all children
        const childrenTypes = objKeys(routers);
        childrenTypes.forEach(childType => {
            routers[childType].forEach(childRouter => this.removeRouter(childRouter.name));
        });

        // Remove router related state subscribers
        this.routerStateStore.unsubscribeAllObserversForRouter(name);

        // Delete ref the manager stores
        this.unregisterRouter(name);
    };

    public registerRouter(
        name: string,
        router: RouterInstance<AllTemplates<CustomTemplates>>
    ): void {
        this._routers[name] = router;
    }

    public unregisterRouter(name: string): void {
        delete this._routers[name];
    }

    /**
     * Called on every location change
     */
    public calcNewRouterState<
        Name extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>
    >(
        location: IInputLocation,
        router: RouterInstance<AllTemplates<CustomTemplates>, Name>,
        ctx: Omit<ILocationActionContext, 'actionName'> = {},
        newState: Record<string, RouterCurrentStateFromTemplates<CustomTemplates>> = {}
    ): Record<string, RouterCurrentStateFromTemplates<CustomTemplates>> {
        if (!router) {
            return;
        }

        // Call the routers reducer to calculate its state from the new location
        const currentRouterState = (router.reducer as RouterReducerFn<
            ExtractCustomStateFromTemplate<AllTemplates<CustomTemplates>[Name]>
        >)(location, router, ctx);

        // Recursively call all children to add their state to the `newState` object
        return objKeys(router.routers).reduce(
            (acc, type) => {
                const newStatesForType = router.routers[type].reduce((accc, childRouter) => {
                    const state = this.calcNewRouterState(
                        location,
                        // cast to be any router instance
                        childRouter,
                        ctx,
                        accc
                    );
                    return {...acc, ...state};
                }, acc);
                return {...acc, ...newStatesForType};
            },
            {...newState, [router.name]: currentRouterState} as Record<
                string,
                RouterCurrentStateFromTemplates<CustomTemplates>
            >
        );
    }

    public createRouterConfigArgs<
        Name extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>
    >(
        routerDeclaration: IRouterDeclaration<AllTemplates<CustomTemplates>>,
        routerType: Name,
        parent: RouterInstance<AllTemplates<CustomTemplates>, Name>
    ): IRouterConfig {
        const templateConfig = this.templates[routerType].config;
        const hasParentOrIsRoot =
            parent && parent.isPathRouter !== undefined ? parent.isPathRouter : true;
        const isSetToBePathRouter =
            routerDeclaration.isPathRouter !== undefined
                ? routerDeclaration.isPathRouter
                : templateConfig.isPathRouter || false;
        const shouldParentTryToActivateNeighbors =
            routerDeclaration.shouldInverselyActivate !== undefined
                ? routerDeclaration.shouldInverselyActivate
                : templateConfig.shouldInverselyActivate || true;
        const isSetToDisableCaching =
            routerDeclaration.disableCaching !== undefined
                ? routerDeclaration.disableCaching
                : templateConfig.disableCaching;
        const shouldParentTryToActivateSiblings =
            templateConfig.shouldParentTryToActivateSiblings || true;

        return {
            routeKey: routerDeclaration.routeKey || routerDeclaration.name,
            isPathRouter:
                templateConfig.canBePathRouter && hasParentOrIsRoot && isSetToBePathRouter,
            shouldInverselyActivate: shouldParentTryToActivateNeighbors,
            disableCaching: isSetToDisableCaching,
            defaultAction: routerDeclaration.defaultAction || [],
            shouldParentTryToActivateSiblings
        };
    }

    public validateNeighborsOfOtherTypesArentPathRouters<
        Name extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>
    >(router: RouterInstance<AllTemplates<CustomTemplates>, Name>): void {
        const nameOfNeighboorRouterThatIsPathRouter = router
            .getNeighbors()
            .reduce((acc, r) => (r.isPathRouter ? r.name : acc), undefined);
        if (nameOfNeighboorRouterThatIsPathRouter) {
            throw new Error(
                `Cannot add ${router.name}. 
                This router is supposed to be a path router but a neighbor (${nameOfNeighboorRouterThatIsPathRouter} is already a path router.
                In order to make the router state tree deterministic only one type of neighbor should have isPathRouter set to true. 
                To get rid of this error either use a different router type or set on neighbor router type to isPathRouter to false `
            );
        }
    }

    public validateRouterCreationInfo<
        Name extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>
    >(name: string, type: Name, config: IRouterConfig): void {
        // Check if the router type exists
        if (!this.routerTypes[type] && type !== 'root') {
            throw new Error(
                `The router type ${type} for router '${name}' does not exist. Consider creating a template for this type.`
            );
        }

        // Check to make sure a router with the same name hasn't already been added
        if (this.routers[name]) {
            throw new Error(`A router with the name '${name}' already exists.`);
        }

        // Check if the router routeKey is unique
        const routeKeyAlreadyExists = Object.values(this.routers).reduce((acc, r) => {
            return acc || r.routeKey === config.routeKey;
        }, false);
        if (routeKeyAlreadyExists) {
            throw new Error(`A router with the routeKey '${config.routeKey}' already exists`);
        }
    }

    /**
     *
     * Creates the arguments that the router object constructor expects
     *
     * This method is overridden by libraries like `router-primitives-mobx` as it is a convenient
     * place to redefine the getters and setters `getState` and `subscribe`
     */
    public createNewRouterInitArgs<
        Name extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>
    >({
        name,
        config,
        type,
        parentName
    }: // TODO change Templates to CustomTemplates so generics flow into children on tree
    IRouterCreationInfo<AllTemplates<CustomTemplates>, Name>): IRouterInitArgs<
        AllTemplates<CustomTemplates>,
        Name,
        IManager<CustomTemplates>
    > {
        const parent = this.routers[parentName];
        const actions = objKeys(this.templates[type].actions);

        return {
            name,
            config: {...config},
            type,
            parent,
            routers: {},
            manager: this as IManager<CustomTemplates>,
            root: this.rootRouter,
            getState: this.routerStateStore.createRouterStateGetter(name),
            subscribe: this.routerStateStore.createRouterStateSubscriber(name),
            actions
        };
    }

    /**
     * Create a router instance
     *
     * Redefined by libraries like `router-primitives-mobx`.
     * Good place to change the base router prototype or decorate methods
     */
    public createRouterFromInitArgs<
        Name extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>
    >(
        initalArgs: IRouterInitArgs<
            AllTemplates<CustomTemplates>,
            NarrowRouterTypeName<Name>,
            IManager<CustomTemplates>
        >
    ): RouterInstance<AllTemplates<CustomTemplates>, NarrowRouterTypeName<Name>> {
        const routerClass = this.routerTypes[initalArgs.type];
        // TODO add tests for passing of action names
        return new routerClass({...initalArgs});
    }

    public setCacheFromLocation = (location: IInputLocation): void => {
        if (location.search[this.cacheKey]) {
            this.routerCache.setCacheFromSerialized(location.search[this.cacheKey] as string);
        }
    };

    public removeCacheFromLocation = (existingLocation: IInputLocation): void => {
        const newLocation = JSON.parse(JSON.stringify({...existingLocation}));
        newLocation.search[this.cacheKey] = undefined;

        this.serializedStateStore.setState({
            ...newLocation,
            options: {...newLocation.options, replaceLocation: true}
        });
    };

    /**
     * Given a location change, set the new router state tree state
     * AKA:new location -> new state
     *
     * The method `calcNewRouterState` will recursively walk down the tree calling each
     * routers reducer to calculate the state
     *
     * Once the state of the entire tree is calculate, it is stored in a central store,
     * the `routerStateStore`
     */
    public setNewRouterState(location: IInputLocation): void {
        this.setCacheFromLocation(location);

        // Replaces current location in searialized state store which will
        // trigger a new state change cascade and retrigger this method without
        // cache in the location
        this.setCacheFromLocation(location);
        if (this.removeCacheAfterRehydration && location.search[this.cacheKey] !== undefined) {
            return this.removeCacheFromLocation(location);
        }

        // if no routers have been added yet
        if (!this.rootRouter) {
            return;
        }
        const newState = this.calcNewRouterState(
            location,
            this.rootRouter as RouterInstance<AllTemplates<CustomTemplates>>
        );

        this.routerStateStore.setState(newState);
    }

    /**
     * Method for creating a router. Routers created with this method
     * aren't added to the manager and are missing connections to parent and child routers
     *
     * To correctly add a router such that it can be managed by the manager and has
     * parent and child router connections, use one of the `add` methods on the manager.
     * Those methods use this `createRouter` method in turn.
     */
    public createRouter<Name extends NarrowRouterTypeName<keyof AllTemplates<CustomTemplates>>>({
        name,
        config,
        type,
        parentName
    }: IRouterCreationInfo<
        AllTemplates<CustomTemplates>,
        NarrowRouterTypeName<Name>
    >): RouterInstance<AllTemplates<CustomTemplates>, Name> {
        this.validateRouterCreationInfo(name, type, config);

        const initalArgs = this.createNewRouterInitArgs({name, config, type, parentName});
        return this.createRouterFromInitArgs({...initalArgs}) as RouterInstance<
            AllTemplates<CustomTemplates>,
            // TODO fix me
            any // eslint-disable-line
        >;
    }
}

// const test = new Manager<{custom: DefaultTemplates['stack']}>({} as any);
// const custom = test.rootRouter.routers['custom'];
// const customState = custom[0].state;
// const customRootState = test.rootRouter.state;
// test.routers;
// const b = new test.routerTypes.custom({} as any);
// const d = b.reducer('a' as any, 'b' as any, 'c' as any);
// b.toBack;
