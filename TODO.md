# Feature Roadmap

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
- [x] Performance Optimized: Efficient state updates and retrieval, even with deeply nested structures
- [x] Type-Safe: Full TypeScript support for enhanced developer experience
- [x] Reactive: Built-in subscription mechanism for efficient UI updates
- [x] Async Action Support: Easily handle asynchronous state updates
- [x] Immutable Updates: Ensures predictable state changes with immutable update patterns
- [x] Developer Tools Integration: Easy debugging with integrated developer tools
- [ ] Persistence: Built-in support for state persistence
- [x] Scalable Architecture: Designed to scale from simple apps to complex, multiprocessing applications

### TODOs

- [x] multi-transport
- [x] logger support verbose

- [x] setState check share
- [x] react auto selector

- [ ] add more tests
- [ ] add more examples
- [ ] add more documentation
- [ ] benchmark

- [ ] Persist middleware
- [ ] Undo/Redo(@coaction/history)
- [ ] supports Zustand middlewares and Redux middlewares
- [x] namespace support
- [x] handle error proxy action
- [x] Middleware Support
- [x] refactor name properties
- [x] Fix @coaction/pinia type issue
- [x] Fix @coaction/pinia name checker
- [x] computed properties in @coaction/react
- [x] Fix @coaction/mobx type issue
- [x] Support for multiple worker stores with same base store
- [x] Fix enablePatches checker
- [x] Fix @coaction/pinia multiple action in a single function
- [x] Fix @coaction/mobx multiple action in a single function
- [ ] support for cross-store
- [ ] implement coaction-react with alien-signals
- [ ] implement coaction for Zustand
- [x] implement coaction for MobX
  - no support for custom observables
  - no support for lazy observables
- [ ] implement coaction-vue
- [ ] implement coaction-solid
- [ ] implement coaction-angular
- [ ] implement coaction-svelte
- [ ] implement coaction for Redux Toolkit
- [ ] implement coaction for Jotai
- [ ] implement coaction for XState
- [x] implement coaction for Pinia
  - no support for async actions(it will be merged into main thread with a single patch for updating the state)
    - It must be split into sync update action
  - [ ] handle $patch
  - [ ] handle $reset
  - [ ] handle computed properties
  - [ ] Fix Pinia StoreProperties
  - [ ] Pinia does not support detecting changes without a action
- [ ] implement coaction for Valtio
- [ ] implement coaction for nanostores
- [ ] implement coaction for @ngrx/store
- [ ] implement coaction-angular
- [ ] implement coaction-svelte
- [ ] implement coaction-Solid
- [ ] add devtools support
