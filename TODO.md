# TODO

- [x] Middleware Support: Supports state subscriptions and middleware for side effects and enhanced state handling
- [x] Namespace Support: Avoid key conflicts with namespaced slices
- [x] Multi-Store Workers: Run multiple stores within a single Web Worker
- [x] Multi-Transport Support: Use generic transports for state synchronization
- [x] Slices Pattern: Easily combine multiple slices into a single store
- [x] Cross-Framework Compatibility: Seamlessly works with React, Vue, Solid.js, Angular, and other modern web frameworks
- [x] Shared Stores Across Workers: Use the same store definition across multiple Workers
- [x] Multiprocessing State Management: Effortlessly manage state across main thread and Workers
- [x] Intuitive API Design: Simple and expressive API inspired by popular state management libraries
- [x] Flexible Store Creation: Create multiple stores with unique names for better organization
- [x] Worker Integration: Easy integration with Web Workers and Shared Worker for offloading computations
- [x] Computed Properties: Support for derived state through getter functions
- [ ] Performance Optimized: Efficient state updates and retrieval, even with deeply nested structures
- [ ] Type-Safe: Full TypeScript support for enhanced developer experience
- [ ] Reactive: Built-in subscription mechanism for efficient UI updates
- [x] Async Action Support: Easily handle asynchronous state updates
- [x] Immutable Updates: Ensures predictable state changes with immutable update patterns
- [x] Developer Tools Integration: Easy debugging with integrated developer tools
- [ ] Persistence: Built-in support for state persistence
- [ ] Scalable Architecture: Designed to scale from simple apps to complex, multiprocessing applications
- [ ] supports Zustand middlewares and Redux middlewares

- [ ] implement coaction-react with alien-signals
- [ ] implement coaction for Zustand

- [x] implement coaction for MobX

- [ ] implement coaction-vue
- [ ] implement coaction-solid
- [ ] implement coaction-angular
- [ ] implement coaction-svelte
- [ ] implement coaction for Redux Toolkit

  - no support for custom observables
  - no support for lazy observables

- [ ] implement coaction for Jotai
- [ ] implement coaction for XState
- [x] implement coaction for Pinia
  - no support for async actions(it will be merged into main thread with a single patch for updating the state)
    - It must be split into sync update action
- [ ] implement coaction for Valtio
- [ ] implement coaction for nanostores
- [ ] implement coaction for @ngrx/store
- [ ] implement coaction-angular
- [ ] implement coaction-svelte
- [ ] implement coaction-Solid
- [x] fix slices checker
- [x] fix type
- [ ] add devtools support

### TODOs

- [x] namespace support
- [x] handle error proxy action
- [x] Middleware Support
- [x] refactor name properties
- [x] Fix @coaction/pinia type issue
- [x] Fix @coaction/pinia name checker
- [x] computed properties in @coaction/react
- [x] multi-transport
- [x] Fix @coaction/mobx type issue
- [x] Support for multiple worker stores with same base store
- [x] Fix enablePatches checker
- [x] Fix @coaction/pinia multiple action in a single function
- [x] Fix @coaction/mobx multiple action in a single function
- [ ] Fix Pinia StoreProperties
- [ ] Pinia does not support detecting changes without a action

- [ ] support for cross-store

  - [ ] handle $patch
  - [ ] handle $reset
  - [ ] handle computed properties

- [ ] Undo/Redo(@coaction/history)
- [ ] add more tests
- [ ] add more examples
- [ ] add more documentation
