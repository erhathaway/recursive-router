import {IRouterDeclaration, AllTemplates, Manager, defaultTemplates} from '../../../src';
import {objKeys} from '../../../src/utilities';
const createRouterTree = (routerType: string): IRouterDeclaration<AllTemplates> => ({
    name: 'root',
    children: {
        [routerType]: [
            {
                name: 'level1',
                disableCaching: true,
                defaultAction: ['show'],
                isPathRouter: false,
                children: {
                    [routerType]: [
                        {
                            name: 'level2',
                            defaultAction: ['show'],
                            children: {
                                [routerType]: [
                                    {
                                        name: 'level3',
                                        disableCaching: false,
                                        defaultAction: ['show'],
                                        children: {
                                            [routerType]: [
                                                {
                                                    name: 'level4',
                                                    defaultAction: ['show'],
                                                    children: {
                                                        [routerType]: [{name: 'level5'}]
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        ]
    }
});

describe('Integration', () => {
    describe('Router', () => {
        describe('Cache', () => {
            objKeys(defaultTemplates)
                .filter(t => t !== 'root')
                .forEach(templateName => {
                    describe(`${templateName}`, () => {
                        it('Cache settings are inherited from parent if not explicitly set', () => {
                            const manager = new Manager({
                                routerDeclaration: createRouterTree(templateName),
                                errorWhenMissingData: false
                            });
                            manager.routers['level1'].hide();
                            // Level1 Router has disableCache = true
                            expect(manager.routerCache.cache['level1']).toBeUndefined();
                            expect(manager.routers['level1'].state.visible).toBeFalsy();

                            // Level2 Router has no setting for disableCache, so it inherits from its parent
                            expect(manager.routerCache.cache['level2']).toBeUndefined();
                            expect(manager.routers['level2'].state.visible).toBeFalsy();
                        });

                        it('Explicitly set cache settings override inherited ones', () => {
                            const manager = new Manager({
                                routerDeclaration: createRouterTree(templateName),
                                errorWhenMissingData: false
                            });
                            manager.routers['level1'].hide();

                            // Level1 Router has disableCache = true
                            expect(manager.routerCache.cache['level1']).toBeUndefined();
                            expect(manager.routers['level1'].state.visible).toBeFalsy();

                            // Level3 Router has disableCache = false, so it overrides the inherited one
                            if (manager.routers['level3'].config.isDependentOnExternalData) {
                                expect(manager.routerCache.cache['level3']).toBeUndefined();
                            } else {
                                expect(manager.routerCache.cache['level3']).not.toBeUndefined();
                            }
                            expect(manager.routers['level3'].state.visible).toBeFalsy();

                            // Level4 Routers inherit from Level3 NOT Level1
                            if (manager.routers['level3'].config.isDependentOnExternalData) {
                                expect(manager.routerCache.cache['level4']).toBeUndefined();
                            } else {
                                expect(manager.routerCache.cache['level4']).not.toBeUndefined();
                            }
                            expect(manager.routers['level4'].state.visible).toBeFalsy();
                        });
                    });
                });
        });
    });
});
