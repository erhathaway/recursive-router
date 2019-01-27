# Recursive Router     


Recursive router is both a library for defining routers and a library to run them. Instead of defining how the URL is constructed you define the visual elements of your app and URL construction is automatically handled. Plus, if you work on a platform where there is no concept of a URL, you can still use this library!

# About

In the context of this library, a router should be thought of as a feature of your application that responds to actions of other application features. 

For example, a router can be 'visible' when other routers are 'hidden'. This type of logic is what a scene router uses. Or, as another example, a router can be 'in front of' or 'behind' other routers. This type of logic is what a stack router uses. By defining your application in terms of visual elements like scene or stack (along with feature and data) you can implement variations of complex application routing. 

The goal of this library is to create a common interface for components of an application to consume such that they can control application routing in a declarative way and not have to worry about implementing boilerplate logic that most routing libraries require. Furthermore, the goal of this library is to also provide declarative ways to perform complex routing, based on things like: sibling router state, neighborhood router state, historical state, deep linking, serialization of arbitrary data into router path, etc. This library is also modular asnd extensible, thus easily supporting bindings to various app paradigms and state managers. 

Recursive router is framework agnostic, has no dependencies, and can be used directly in your app. However, there also exist React bindings that provide a more convient, simple, and declarative way to compose all your routing logic.

React bindings: [github.com/erhathaway/recursive-router-react](https://github.com/erhathaway/recursive-router-react)

Finally, should the existing router types not be enough, this library provides you with a way to create your own routers!

|   | Recursive Router |
| - | ------------ |
| 😎 | View library agnostic - with bindings for React |
| ✨ | Router state as a direct function of location (URL) |
| ⏱ | Built in history - Previous router state can be derived
| 🔀 | One way data flow. Location -> Router State tree -> App |
| 🔗 | Trivial Deep linking - Use the URL to generate an identical router state tree on any platform |
| 😱 | Opinionated and automatic URL construction |
| 🚀 | Reactive - Subscribe to the state of any router in the router state tree |
| 👌 | Simple - Declare the route tree using a small but expressive syntax set |


TL;DR

If you dislike how much ceremony is around configuring a router and you also frequently find existing routing solutions coming up short, then this library may be something that interests you!

# How it works:

1. Recursive router treats the URL as a namespace for the storage of a state tree representing `all routable state`™. 
2. Writing to the URL is handled by the router.
3. Changes to the URL are reduced over the router state tree
4. Various types of routers in the router state tree exist. The differences are used to control how their state will get updated when the URL changes.
5. Once the router state tree has been updated, observers of updated routers are notified.


# How to use:


### 1. Describe the layout of your app in terms of multiple `Stack`, `Scene`, `Feature`, and `Data` routers.

Each router is a javascript object with the keys: `name`, `routers`
```
  { 
    name: 'user',
    routers: {},
  }
```

The `routers` key is used to specify other routers that are children of this router:
```
  { 
    name: 'user',
    routers: {
      scene: [SceneRouer1],
      feature: [FeatureRouter1, FeatureRouter2],
      stack: [StackRouter1, StackRouter2],
      data: [DataRouter1],
    },
  }
```

An example app layout might look like:

```
const tree =
  { name: 'root',
    routers: {
      scene: [
        { name: 'docs' 
          routers: { 
            feature: [{ name: 'doc-nav' }], 
            stack: [{ name: 'doc-intro' }, { name: 'doc-help' }], 
          }
        },
        { name: 'user', default: { visible: true }, routers: {<routersObj>} },
      ],
    },
  }
```

### 2. Register the router tree
```
{ registerRouter } from 'recursive-router';

const routers = registerRouter(tree);
```

### 3. Observe when the routers have changed via the power of mobx

```
<App>
  <NavBar>
    <Button onClick={routers['user'].show}>
    <Button onClick={routers['docs'].show}>
  </NavBar>
  <Scenes>
    { routers['docs'].visible && <Docs /> }
    { routers['user'].visible && <User /> }
  </Scenes>
</App>
```

# Router types

Almost all routeable and dynamic apps can be expressed in terms of 4 predefined router types: `Stack`, `Scene`, `Feature`, and `Data`. If these routers don't suit your needs, see below for how to create your own router type.


## `Scene` router
| | |
|-|-|
| **description** | show only one router at a time |
| **url access**  | write to both path and search parts of url |
| **states**      | `visible hidden` |
| **methods**     | `show hide` |
| **example url** | `http://<something>/sceneA/2/sceneB` |
|**example url**  | `http://<something>/sceneA?sceneC` |

## `Stack` router
| | |
|-|-|
| **description** | show multiple routers at a time with an ordering |
| **url access**  | write to only search parts of url |
| **states**      | `visible hidden order` |
| **methods**     | `show hide toFront toBack forward backward` |
|**example url**  | `http://<something>?modal1=1&modal2=0` |


## `Feature` router
| | |
|-|-|
| **description** | show multiple routers at a time with no sense of ordering |
| **url access**  | write to only search parts of url |
| **states**      | `visible hidden` |
| **methods**     | `show hide` |
|**example url**  | `http://<something>?feature1&feature2` |

## `Data` router
| | |
|-|-|
| **description** | show a string of data in the url to set things like page number, item ID, and callback urls |
| **url access**  | write to both path and search parts of url |
| **states**      | `visible hidden` |
| **methods**     | `show hide` |
| **example url** | `http://<something>?data1&data2` |
|**example url**  | `http://<something>/data3/?data1&data2` |

## URL Construction 

URL construction is automatic and handled for you. However, if you wish to manipulate how the URL pathname is created, simply arrange how `Scene` and `Data` routers are composed with respect to one another.

The pathname part of a url is the union of router names that make up the longest visibile path of scene and data routers from the root router.

All other router state is stored in the search params part of a url.



## Rehydration of state after visibility change

All routers will by default rehydrate children routers back to how the chidlren were when the parent state changed. The exception to this is if a child in the branch had their state updated while said router was hidden. This setting can be overridden on a case-by-case basis during the router tree declaration. 


## V1 Roadmap

- Finish playground 
- Demos of common apps built with `recursive-router`
- Add `redux` and `react` bindings
- Clean up code and remove dependency on mobx
- Add tests
- Add docs and a better README
