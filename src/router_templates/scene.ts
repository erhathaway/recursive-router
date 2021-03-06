import {
    TemplateAction,
    RouterCurrentState,
    IRouterTemplate,
    IInputLocation,
    TemplateReducer
} from '../types';

/**
 * A scene router will hide all its sibling routers when it is being shown
 * This process involves:
 *    1. Hiding the sibling routers and disabling cache for the specific router so it doesn't rehydrate
 *    2. Checking whether the scene router is a pathRouter or not
 *    3. Adding the scene router to either the path or query params
 */
const show: TemplateAction = (options, oldLocation, router, ctx) => {
    // Each sibling router needs to be hidden. The location is modified to reflect hiding all siblings
    const location: IInputLocation = router.siblings.reduce(
        (acc, s) => {
            // We disable caching of siblings b/c we dont want them to be shown if a parent rehydrates
            // This is b/c the scene being shown is now the visible one and should be cached if a parent hides
            // It is important to remember that `disableCaching` is passed to options not context
            //   b/c we only want it take affect for the immediate routers we call instead of the
            //   entire update cycle
            // eslint-disable-next-line
            return s.hide({...options, disableCaching: true}, acc as any, s, ctx) as any;
        },
        // eslint-disable-next-line
        {...oldLocation} as any
    ) as IInputLocation;

    if (router.isPathRouter) {
        location.pathname[router.pathLocation] = router.routeKey;
        // Drop pathname after this pathLocation
        location.pathname = location.pathname.slice(0, router.pathLocation + 1);
    } else {
        location.search[router.routeKey] = true;
    }

    return location;
};

const hide: TemplateAction = (_options, oldLocation, router, _ctx) => {
    const location = {...oldLocation};

    if (router.isPathRouter) {
        location.pathname = location.pathname.slice(0, router.pathLocation);
    } else {
        location.search[router.routeKey] = undefined;
    }

    return location;
};

const reducer: TemplateReducer = (location, router, _ctx) => {
    const newState: Partial<RouterCurrentState> = {};
    if (router.isPathRouter) {
        newState['visible'] = location.pathname[router.pathLocation] === router.routeKey;
    } else {
        newState['visible'] = location.search[router.routeKey] === 'true';
    }

    return newState as RouterCurrentState;
};

const template: IRouterTemplate = {
    actions: {show, hide},
    reducer,
    config: {
        canBePathRouter: true,
        isPathRouter: true,
        shouldInverselyActivate: true,
        shouldParentTryToActivateSiblings: false
    }
};
export default template;
